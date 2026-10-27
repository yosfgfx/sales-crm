import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MediaNotification, TeamMember } from "@/data/media";
import { TASK_KIND_LABELS, addressed, type PersonalTask, type TaskBoard, type TaskKind, type TaskPriority, type TaskStatus, type TaskSuggestion, type TaskUpdate } from "@/data/engagement";
import { isAdministrator } from "./auth";
import { AiUnavailable, askStructured } from "./ai";
import { database, type Queryable } from "./db";
import { MediaServerError } from "./http";
import { insertNotifications } from "./repository";

type Row = Record<string, unknown>;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KINDS: TaskKind[] = ["content", "design", "review", "coordination", "meeting", "personal", "other"];
const PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];
const OPEN_IDEA = ["draft", "quotations", "review", "changes", "approved", "scheduled", "designing", "design_review"];
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
const riyadhDay = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(date);
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export const canSeeAllTasks = (member: TeamMember) => isAdministrator(member) || member.role === "manager";

export function toTask(row: Row): PersonalTask {
  const ai = typeof row.ai === "string" ? JSON.parse(row.ai) : row.ai;
  const fields = typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields;
  return {
    id: String(row.id), title: String(row.title), description: String(row.description || ""), dueDate: row.due_date ? String(row.due_date) : null, doneAt: iso(row.done_at), ideaId: (row.idea_id as string) || null, meetingId: (row.meeting_id as string) || null,
    source: row.source as PersonalTask["source"], createdAt: iso(row.created_at)!, createdBy: String(row.created_by), assigneeId: String(row.member_id),
    status: (row.status as TaskStatus) || (row.done_at ? "done" : "todo"), priority: (row.priority as TaskPriority) || "normal", kind: (row.kind as TaskKind) || "other", sequence: row.sequence === null || row.sequence === undefined ? null : Number(row.sequence),
    lastUpdate: String(row.last_update || ""), updatedAt: iso(row.updated_at) || iso(row.created_at)!, ai: (ai && typeof ai === "object" ? ai : {}) as PersonalTask["ai"], fields: (fields && typeof fields === "object" ? fields : {}) as Record<string, string>,
  };
}
const toUpdate = (row: Row): TaskUpdate => ({ id: String(row.id), taskId: String(row.task_id), actorId: String(row.actor_id), kind: row.kind as TaskUpdate["kind"], body: String(row.body || ""), at: iso(row.at)! });

const VISIBLE = `(t.member_id = $1 or t.created_by = $1 or exists (select 1 from wasl.ideas i where i.id = t.idea_id and (i.owner_id = $1 or i.designer_id = $1)))`;

export async function loadTaskBoard(q: Queryable, viewer: TeamMember): Promise<TaskBoard> {
  const all = canSeeAllTasks(viewer);
  const where = all ? "true" : VISIBLE;
  const params = all ? [] : [viewer.id];
  const tasks = await q.query(`select t.* from wasl.tasks t where ${where} and (t.done_at is null or t.done_at > now() - interval '14 days') order by t.done_at nulls first, case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, t.due_date nulls last, t.sequence nulls last, t.created_at`, params);
  const updates = await q.query(`select u.* from wasl.task_updates u join wasl.tasks t on t.id = u.task_id where ${where} order by u.at desc limit 80`, params);
  const load = all ? (await q.query<{ member_id: string; open: number; overdue: number; done_week: number }>(`select m.id as member_id,
      count(t.id) filter (where t.done_at is null)::int as open,
      count(t.id) filter (where t.done_at is null and t.due_date < ($1::date))::int as overdue,
      count(t.id) filter (where t.done_at > now() - interval '7 days')::int as done_week
      from wasl.members m left join wasl.tasks t on t.member_id = m.id where m.active and m.role not in ('superadmin') group by m.id`, [riyadhDay()])).rows.map((row) => ({ memberId: row.member_id, open: row.open, overdue: row.overdue, doneWeek: row.done_week })) : [];
  return { tasks: tasks.rows.map(toTask), updates: updates.rows.map(toUpdate), load };
}

async function lockTask(q: Queryable, id: string, viewer: TeamMember) {
  if (!UUID.test(id)) throw new MediaServerError("المهمة غير موجودة.", 404, "NOT_FOUND");
  const row = (await q.query(`select t.* from wasl.tasks t where t.id = $2 and (${canSeeAllTasks(viewer) ? "true" : VISIBLE}) for update of t`, [viewer.id, id])).rows[0];
  if (!row) throw new MediaServerError("المهمة غير موجودة.", 404, "NOT_FOUND");
  return toTask(row);
}

async function logUpdate(q: Queryable, taskId: string, actorId: string, kind: TaskUpdate["kind"], body = "") {
  await q.query("insert into wasl.task_updates (id, task_id, actor_id, kind, body) values ($1, $2, $3, $4, $5)", [randomUUID(), taskId, actorId, kind, body.slice(0, 2000)]);
  await q.query("update wasl.tasks set updated_at = now() where id = $1", [taskId]);
}

async function notify(q: Queryable, actor: TeamMember, recipients: string[], task: Pick<PersonalTask, "id" | "title">, title: string, body: string, type: MediaNotification["type"] = "task") {
  const at = new Date().toISOString();
  await insertNotifications(q, [...new Set(recipients)].filter((id) => id && id !== actor.id).map((recipientId): MediaNotification => ({ id: randomUUID(), recipientId, ideaId: "", type, title, body: `${actor.name} · ${body}`, createdAt: at, read: false, actorId: actor.id, actorName: actor.name, entityType: "task", entityId: task.id, action: "task" })));
}

/** Cheap, deterministic parsing: @name or a member's first name, #IC-code or an idea title, Arabic day words and dates. */
const AR = "\\u0600-\\u06FF\\w";
const word = (pattern: string) => new RegExp(`(?<![${AR}])(?:${pattern})(?![${AR}])`);
export function parseTaskText(raw: string, members: Pick<TeamMember, "id" | "name" | "active">[], ideas: { id: string; code: string; title: string }[], today = riyadhDay()) {
  let text = raw.trim();
  let assigneeId: string | null = null, ideaId: string | null = null, dueDate: string | null = null, priority: TaskPriority = "normal";
  const mention = text.match(/@([^\s@#]+)/);
  if (mention) {
    const hit = members.find((member) => member.active && member.name.replace(/\s+/g, "").includes(mention[1].replace(/\s+/g, "")));
    if (hit) { assigneeId = hit.id; text = text.replace(mention[0], "").trim(); }
  }
  const code = text.match(/#?\b(IC-\d{4}-P?\d{3,})\b/i);
  if (code) {
    const hit = ideas.find((idea) => idea.code.toLowerCase() === code[1].toLowerCase());
    if (hit) { ideaId = hit.id; text = text.replace(code[0], "").trim(); }
  }
  const weekday = ["الأحد", "الاثنين", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const dayIndex = (name: string) => ({ "الأحد": 0, "الاثنين": 1, "الإثنين": 1, "الثلاثاء": 2, "الأربعاء": 3, "الخميس": 4, "الجمعة": 5, "السبت": 6 })[name] ?? -1;
  const explicit = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const afterTomorrow = word("بعد بكرة|بعد بكره|بعد غد"), tomorrow = word("بكرة|بكره|غداً|غدا"), todayWord = word("اليوم");
  if (explicit && validDay(explicit[1])) { dueDate = explicit[1]; text = text.replace(explicit[0], "").trim(); }
  else if (afterTomorrow.test(text)) { dueDate = addDays(today, 2); text = text.replace(afterTomorrow, "").trim(); }
  else if (tomorrow.test(text)) { dueDate = addDays(today, 1); text = text.replace(tomorrow, "").trim(); }
  else if (todayWord.test(text)) { dueDate = today; text = text.replace(todayWord, "").trim(); }
  else {
    for (const name of weekday) {
      const pattern = word(`(?:يوم\\s+)?${name}`);
      if (pattern.test(text)) {
        const current = new Date(`${today}T12:00:00Z`).getUTCDay();
        const gap = (dayIndex(name) - current + 7) % 7 || 7;
        dueDate = addDays(today, gap);
        text = text.replace(pattern, "").trim();
        break;
      }
    }
  }
  const urgent = word("عاجل|عاجلة|ضروري|فوراً|فورا"), important = word("مهم|مهمة");
  if (urgent.test(text)) { priority = "urgent"; text = text.replace(urgent, "").trim(); }
  else if (important.test(text)) { priority = "high"; text = text.replace(important, "").trim(); }
  text = text.replace(/\s{2,}/g, " ").replace(/^[\s،,:-]+|[\s،,:-]+$/g, "");
  return { title: (text || raw.trim()).slice(0, 300), assigneeId, ideaId, dueDate, priority };
}

const ParsedTask = z.object({
  title: z.string().describe("Clean imperative task title in Arabic, without names, dates or idea codes"),
  kind: z.enum(KINDS),
  priority: z.enum(PRIORITIES),
  assigneeId: z.string().nullable().describe("A member id from the roster, or null when the author keeps it"),
  ideaId: z.string().nullable().describe("An idea id from the list when the task clearly belongs to it, else null"),
  dueDate: z.string().nullable().describe("YYYY-MM-DD in Asia/Riyadh when a date or day is implied, else null"),
  sequence: z.number().int().nullable().describe("Step number inside the idea workflow (1 = first), or null"),
  reason: z.string().describe("One short Arabic sentence explaining the classification"),
});
const STABLE_PARSE = `أنت مساعد منصة «وصل» لفريق التواصل الداخلي. تحوّل جملة يكتبها أحد الأعضاء إلى مهمة منظمة.
الأنواع: content (كتابة وتحرير)، design (تصميم وموشن ومونتاج)، review (مراجعة واعتماد)، coordination (تنسيق ومتابعة وتواصل)، meeting (ما يخص اجتماعاً)، personal (شخصي)، other.
قواعد: اربط المهمة بفكرة فقط عند تطابق واضح بالعنوان أو الرمز. أسند لعضو فقط إذا ذُكر اسمه أو وصفه بوضوح. التسلسل المعتاد لتنفيذ فكرة: 1 كتابة المحتوى، 2 اعتماد الفكرة والمحتوى، 3 التصميم والإنتاج، 4 التسليم والنشر. لا توجد خطوة مستقلة لمراجعة التصميم. لا تخترع تواريخ.`;

export async function enrichTask(q: Queryable, actor: TeamMember, task: PersonalTask, raw: string) {
  const members = (await q.query<{ id: string; name: string; role: string }>("select id, name, role::text as role from wasl.members where active and role <> 'superadmin'")).rows;
  const ideas = (await q.query<{ id: string; code: string; title: string; status: string; owner_id: string; designer_id: string | null }>("select id, code, title, status::text as status, owner_id, designer_id from wasl.ideas where deleted_at is null and status::text = any($1::text[]) order by updated_at desc limit 60", [OPEN_IDEA])).rows;
  const dynamic = `اليوم ${riyadhDay()} (${new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", weekday: "long" }).format(new Date())}). كاتب المهمة: ${actor.name} (${actor.id}).
الأعضاء: ${members.map((member) => `${member.id}=${member.name} [${member.role}]`).join("؛ ")}
الأفكار المفتوحة: ${ideas.map((idea) => `${idea.id} | ${idea.code} | ${idea.title} | ${idea.status}`).join("\n")}`;
  const parsed = await askStructured(q, { memberId: actor.id, purpose: "parse_task", stable: STABLE_PARSE, dynamic, user: `النص: «${raw}»\nالاستنتاج الأولي: ${JSON.stringify({ title: task.title, assigneeId: task.assigneeId, ideaId: task.ideaId, dueDate: task.dueDate })}`, schema: ParsedTask, effort: "low", maxTokens: 600 });
  const assignee = parsed.assigneeId && members.some((member) => member.id === parsed.assigneeId) ? parsed.assigneeId : task.assigneeId;
  const idea = parsed.ideaId && ideas.some((item) => item.id === parsed.ideaId) ? parsed.ideaId : task.ideaId;
  const dueDate = parsed.dueDate && validDay(parsed.dueDate) ? parsed.dueDate : task.dueDate;
  const title = parsed.title.trim().slice(0, 300) || task.title;
  const changes: string[] = [];
  if (assignee !== task.assigneeId) changes.push(`أُسندت إلى ${members.find((member) => member.id === assignee)?.name || assignee}`);
  if (idea !== task.ideaId) changes.push(`رُبطت بالفكرة ${ideas.find((item) => item.id === idea)?.code || ""}`);
  if (dueDate !== task.dueDate && dueDate) changes.push(`الموعد ${dueDate}`);
  await q.query("update wasl.tasks set title = $2, kind = $3, priority = $4, member_id = $5, idea_id = $6, due_date = $7::date, sequence = $8, ai = $9::jsonb, updated_at = now() where id = $1", [task.id, title, parsed.kind, parsed.priority, assignee, idea, dueDate, parsed.sequence, JSON.stringify({ kind: parsed.kind, reason: parsed.reason, ideaCode: ideas.find((item) => item.id === idea)?.code, model: process.env.WASL_AI_MODEL || "claude-opus-5-5", at: new Date().toISOString() })]);
  await logUpdate(q, task.id, actor.id, "ai", `${TASK_KIND_LABELS[parsed.kind]} · ${parsed.reason}${changes.length ? ` · ${changes.join("، ")}` : ""}`);
  if (assignee !== task.assigneeId && assignee !== actor.id) await notify(q, actor, [assignee], task, "أُسندت إليك مهمة", title, "assignment");
  return (await q.query("select * from wasl.tasks where id = $1", [task.id])).rows[0] ? toTask((await q.query("select * from wasl.tasks where id = $1", [task.id])).rows[0]) : task;
}

export async function createTask(q: Queryable, actor: TeamMember, body: Record<string, unknown>) {
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : randomUUID();
  const raw = String(body.title || "").trim();
  if (!raw || raw.length > 600) throw new MediaServerError("اكتب عنوان المهمة.", 422, "INVALID_INPUT");
  const members = (await q.query<{ id: string; name: string; active: boolean }>("select id, name, active from wasl.members")).rows;
  const ideas = (await q.query<{ id: string; code: string; title: string }>("select id, code, title from wasl.ideas where deleted_at is null")).rows;
  const local = parseTaskText(raw, members, ideas);
  const assigneeId = typeof body.assigneeId === "string" && ID.test(body.assigneeId) ? body.assigneeId : local.assigneeId || actor.id;
  if (!members.some((member) => member.id === assigneeId && member.active)) throw new MediaServerError("العضو غير متاح.", 422, "INVALID_INPUT");
  const ideaId = typeof body.ideaId === "string" && ID.test(body.ideaId) ? body.ideaId : local.ideaId;
  if (ideaId && !ideas.some((idea) => idea.id === ideaId)) throw new MediaServerError("الفكرة غير موجودة.", 404, "NOT_FOUND");
  const dueDate = typeof body.dueDate === "string" && validDay(body.dueDate) ? body.dueDate : local.dueDate;
  const priority = PRIORITIES.includes(body.priority as TaskPriority) ? (body.priority as TaskPriority) : local.priority;
  const kind = KINDS.includes(body.kind as TaskKind) ? (body.kind as TaskKind) : "other";
  const description = typeof body.description === "string" ? body.description.slice(0, 4000) : "";
  const source = body.source === "ai" || body.source === "plan" ? String(body.source) : "quick";
  const title = typeof body.exactTitle === "string" && body.exactTitle.trim() ? body.exactTitle.trim().slice(0, 300) : local.title;
  await q.query("insert into wasl.tasks (id, member_id, title, description, due_date, idea_id, source, created_by, priority, kind, sequence) values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11) on conflict (id) do nothing", [id, assigneeId, title, description, dueDate, ideaId, source, actor.id, priority, kind, Number.isInteger(body.sequence) ? Number(body.sequence) : null]);
  await logUpdate(q, id, actor.id, "created", title);
  if (assigneeId !== actor.id) await notify(q, actor, [assigneeId], { id, title }, "أُسندت إليك مهمة", title, "assignment");
  return toTask((await q.query("select * from wasl.tasks where id = $1", [id])).rows[0]);
}

export async function updateTask(q: Queryable, actor: TeamMember, body: Record<string, unknown>) {
  const task = await lockTask(q, String(body.id || ""), actor);
  const manager = canSeeAllTasks(actor) || task.createdBy === actor.id || task.assigneeId === actor.id;
  if (!manager) throw new MediaServerError("يعدّل المهمة من أُسندت إليه أو من أنشأها أو المدير.", 403, "FORBIDDEN");
  const recipients = new Set<string>([task.assigneeId, task.createdBy]);
  if (body.status !== undefined) {
    const status = String(body.status) as TaskStatus;
    if (!["todo", "doing", "done"].includes(status)) throw new MediaServerError("حالة غير صالحة.", 422, "INVALID_INPUT");
    if (status !== task.status) {
      await q.query("update wasl.tasks set status = $2, done_at = case when $2 = 'done' then coalesce(done_at, now()) else null end where id = $1", [task.id, status]);
      if (task.meetingId) await q.query("update wasl.meeting_items set done = $2 where task_id = $1", [task.id, status === "done"]);
      await logUpdate(q, task.id, actor.id, "status", status);
      if (status === "done") await notify(q, actor, [...recipients], task, "أُنجزت مهمة", task.title);
    }
  }
  if (body.assigneeId !== undefined) {
    const assigneeId = String(body.assigneeId);
    if (!ID.test(assigneeId) || !(await q.query("select 1 from wasl.members where id = $1 and active", [assigneeId])).rows.length) throw new MediaServerError("العضو غير متاح.", 422, "INVALID_INPUT");
    if (assigneeId !== task.assigneeId) {
      await q.query("update wasl.tasks set member_id = $2 where id = $1", [task.id, assigneeId]);
      await q.query("update wasl.meeting_items set assignee_id = $2 where task_id = $1", [task.id, assigneeId]);
      await logUpdate(q, task.id, actor.id, "assigned", assigneeId);
      await notify(q, actor, [assigneeId], task, "أُسندت إليك مهمة", task.title, "assignment");
    }
  }
  if (body.dueDate !== undefined) {
    const dueDate = body.dueDate ? String(body.dueDate) : null;
    if (dueDate && !validDay(dueDate)) throw new MediaServerError("التاريخ غير صالح.", 422, "INVALID_INPUT");
    if (dueDate !== task.dueDate) { await q.query("update wasl.tasks set due_date = $2::date where id = $1", [task.id, dueDate]); await logUpdate(q, task.id, actor.id, "due", dueDate || ""); }
  }
  if (body.priority !== undefined) {
    const priority = String(body.priority) as TaskPriority;
    if (!PRIORITIES.includes(priority)) throw new MediaServerError("أولوية غير صالحة.", 422, "INVALID_INPUT");
    if (priority !== task.priority) { await q.query("update wasl.tasks set priority = $2 where id = $1", [task.id, priority]); await logUpdate(q, task.id, actor.id, "priority", priority); }
  }
  if (body.kind !== undefined && KINDS.includes(body.kind as TaskKind)) await q.query("update wasl.tasks set kind = $2 where id = $1", [task.id, body.kind]);
  if (body.ideaId !== undefined) {
    const ideaId = body.ideaId ? String(body.ideaId) : null;
    if (ideaId && (!ID.test(ideaId) || !(await q.query("select 1 from wasl.ideas where id = $1 and deleted_at is null", [ideaId])).rows.length)) throw new MediaServerError("الفكرة غير موجودة.", 404, "NOT_FOUND");
    if (ideaId !== task.ideaId) { await q.query("update wasl.tasks set idea_id = $2 where id = $1", [task.id, ideaId]); await logUpdate(q, task.id, actor.id, "linked", ideaId || ""); }
  }
  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, 300);
    if (!title) throw new MediaServerError("اكتب عنوان المهمة.", 422, "INVALID_INPUT");
    if (title !== task.title) { await q.query("update wasl.tasks set title = $2 where id = $1", [task.id, title]); await logUpdate(q, task.id, actor.id, "title", title); }
  }
  if (body.description !== undefined) await q.query("update wasl.tasks set description = $2 where id = $1", [task.id, String(body.description).slice(0, 4000)]);
  if (body.sequence !== undefined) await q.query("update wasl.tasks set sequence = $2 where id = $1", [task.id, body.sequence === null ? null : Math.max(1, Math.min(500, Number(body.sequence) || 1))]);
  if (body.fields !== undefined && body.fields && typeof body.fields === "object") {
    const fields = Object.fromEntries(Object.entries(body.fields as Record<string, unknown>).filter(([key, value]) => /^[\w؀-ۿ -]{1,40}$/.test(key) && typeof value === "string").map(([key, value]) => [key, String(value).slice(0, 500)]).slice(0, 20));
    await q.query("update wasl.tasks set fields = $2::jsonb where id = $1", [task.id, JSON.stringify(fields)]);
  }
  if (typeof body.note === "string" && body.note.trim()) {
    const note = body.note.trim().slice(0, 2000);
    await q.query("update wasl.tasks set last_update = $2 where id = $1", [task.id, note.slice(0, 1000)]);
    await logUpdate(q, task.id, actor.id, "note", note);
    await notify(q, actor, [...recipients], task, "تحديث على مهمة", `${task.title}: ${note.slice(0, 160)}`);
  }
  return toTask((await q.query("select * from wasl.tasks where id = $1", [task.id])).rows[0]);
}

export async function deleteTask(q: Queryable, actor: TeamMember, id: string) {
  const task = await lockTask(q, id, actor);
  if (!(canSeeAllTasks(actor) || task.createdBy === actor.id || task.assigneeId === actor.id)) throw new MediaServerError("يحذف المهمة من أنشأها أو المدير.", 403, "FORBIDDEN");
  await q.query("delete from wasl.tasks where id = $1", [task.id]);
  return { ok: true };
}

const Plan = z.object({ tasks: z.array(z.object({ title: z.string(), kind: z.enum(KINDS), assigneeId: z.string().nullable(), daysFromNow: z.number().int().min(0).max(120), priority: z.enum(PRIORITIES), sequence: z.number().int().min(1).max(20), reason: z.string() })).max(8) });
const STABLE_PLAN = `أنت مساعد منصة «وصل». تقترح خطة تنفيذ عملية لفكرة تواصل داخلي على شكل مهام قصيرة واضحة بالعربية (٣ إلى ٦ مهام)، مرتبة بتسلسل منطقي: كتابة المحتوى ثم اعتماده ثم التصميم والإنتاج ثم التسليم والنشر. لا تقترح خطوة لمراجعة التصميم أو اعتماده؛ التصميم ينتقل من المصمم إلى التسليم مباشرة. تجنّب المهام التي أُنجزت فعلاً حسب حالة الفكرة. أسند كل مهمة لعضو مناسب من الفريق حسب دوره: content لكتابة المحتوى والتنسيق، designer للتصميم، manager للاعتماد. وزّع المواعيد قبل موعد التسليم. لا تكرر المهام الموجودة.`;

export async function suggestIdeaTasks(q: Queryable, actor: TeamMember, ideaId: string): Promise<TaskSuggestion[]> {
  if (!ID.test(ideaId)) throw new MediaServerError("الفكرة غير موجودة.", 404, "NOT_FOUND");
  const idea = (await q.query<Row>("select id, code, title, status::text as status, work_type::text as work_type, description, execution_plan, channels::text[] as channels, owner_id, designer_id, due_date::text as due_date from wasl.ideas where id = $1 and deleted_at is null", [ideaId])).rows[0];
  if (!idea) throw new MediaServerError("الفكرة غير موجودة.", 404, "NOT_FOUND");
  const members = (await q.query<{ id: string; name: string; role: string }>("select id, name, role::text as role from wasl.members where active and role <> 'superadmin'")).rows;
  const existing = (await q.query<{ title: string; status: string }>("select title, status from wasl.tasks where idea_id = $1", [ideaId])).rows;
  const today = riyadhDay();
  const dynamic = `اليوم ${today}. الفريق: ${members.map((member) => `${member.id}=${member.name} [${member.role}]`).join("؛ ")}.`;
  const user = `الفكرة ${idea.code}: «${idea.title}» · الحالة ${idea.status} · نوع العمل ${idea.work_type} · القنوات ${(idea.channels as string[]).join("،")} · موعد التسليم ${idea.due_date || "غير محدد"} · صاحب الفكرة ${idea.owner_id} · المصمم ${idea.designer_id || "لم يُحدد"}.
الوصف: ${String(idea.description || "").slice(0, 1200)}
خطة التنفيذ المكتوبة: ${String(idea.execution_plan || "").slice(0, 1200)}
المهام الموجودة: ${existing.length ? existing.map((task) => `${task.title} (${task.status})`).join("؛ ") : "لا شيء"}`;
  const plan = await askStructured(q, { memberId: actor.id, purpose: "plan_idea", stable: STABLE_PLAN, dynamic, user, schema: Plan, effort: "medium", maxTokens: 2000 });
  return plan.tasks.map((task) => ({ title: task.title.trim().slice(0, 300), kind: task.kind, assigneeId: task.assigneeId && members.some((member) => member.id === task.assigneeId) ? task.assigneeId : null, dueDate: addDays(today, task.daysFromNow), priority: task.priority, sequence: task.sequence, reason: task.reason }));
}

/** Morning reminders with a motivating tone, one per member per day; AI-written when available, templated otherwise. */
export async function runTaskReminders(q: Queryable = database(), now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "numeric", hourCycle: "h23" }).format(now));
  const today = riyadhDay(now);
  if (hour < 8 || [5, 6].includes(new Date(`${today}T12:00:00Z`).getUTCDay())) return 0;
  const members = (await q.query<TeamMember & { address_form: string }>("select id, name, role::text as role, title, initials, color, active, address_form from wasl.members where active and role <> 'superadmin'")).rows;
  let sent = 0;
  for (const member of members) {
    const claimed = await q.query("insert into wasl.job_runs (key) values ($1) on conflict (key) do nothing returning key", [`task-reminder:${today}:${member.id}`]);
    if (!claimed.rows.length) continue;
    const due = (await q.query<{ id: string; title: string; due_date: string | null; status: string; updated_at: Date }>("select id, title, due_date::text as due_date, status, updated_at from wasl.tasks where member_id = $1 and done_at is null and (due_date <= $2::date or (status = 'doing' and updated_at < now() - interval '3 days')) order by due_date nulls last limit 8", [member.id, today])).rows;
    if (!due.length) continue;
    const overdue = due.filter((task) => task.due_date && task.due_date < today), todayTasks = due.filter((task) => task.due_date === today), stale = due.filter((task) => !task.due_date || task.due_date > today);
    const f = member.address_form === "f" ? "f" : "m";
    let body = "";
    try {
      const Nudge = z.object({ message: z.string().max(220) });
      const result = await askStructured(q, { memberId: member.id, purpose: "nudge", stable: "تكتب رسالة صباحية قصيرة ودافئة بالعربية السعودية (جملتان كحد أقصى، دون مبالغة ودون إيموجي) تشجّع عضو الفريق على إنجاز مهامه اليوم، وتذكر أهم مهمة بالاسم. خاطب المؤنث بصيغة المؤنث عند الطلب.", dynamic: `اليوم ${today}.`, user: `العضو: ${member.name} (${f === "f" ? "مؤنث" : "مذكر"}). متأخرة: ${overdue.map((task) => task.title).join("؛ ") || "لا شيء"}. موعدها اليوم: ${todayTasks.map((task) => task.title).join("؛ ") || "لا شيء"}. جارية بلا تحديث منذ أيام: ${stale.map((task) => task.title).join("؛ ") || "لا شيء"}.`, schema: Nudge, effort: "low", maxTokens: 300 });
      body = result.message.trim();
    } catch (error) {
      if (!(error instanceof AiUnavailable)) throw error;
      const first = overdue[0] || todayTasks[0] || stale[0];
      body = overdue.length ? `${addressed(f, "عندك", "عندك")} ${overdue.length} ${overdue.length === 1 ? "مهمة متأخرة" : "مهام متأخرة"}، ${addressed(f, "ابدأ", "ابدئي")} بـ «${first.title}» وخلّ يومك يمشي بخفة.` : todayTasks.length ? `${addressed(f, "ابدأ", "ابدئي")} بـ «${first.title}»، وبعدها يبقى يومك مرتباً.` : `«${first.title}» جارية منذ أيام بلا تحديث؛ ${addressed(f, "اكتب", "اكتبي")} سطراً عن وضعها حتى يطمئن الفريق.`;
    }
    const title = overdue.length ? `${overdue.length === 1 ? "مهمة متأخرة" : `${overdue.length.toLocaleString("ar-SA")} مهام متأخرة`} تنتظرك` : todayTasks.length ? `${todayTasks.length === 1 ? "مهمة واحدة" : `${todayTasks.length.toLocaleString("ar-SA")} مهام`} موعدها اليوم` : "مهمة تحتاج تحديثاً";
    await insertNotifications(q, [{ id: randomUUID(), recipientId: member.id, ideaId: "", type: "reminder", title, body, createdAt: now.toISOString(), read: false, entityType: "task", entityId: due[0].id, action: "task_reminder" }]);
    await q.query("update wasl.tasks set reminded_on = $2::date where id = any($1::uuid[])", [due.map((task) => task.id), today]);
    sent++;
  }
  return sent;
}
