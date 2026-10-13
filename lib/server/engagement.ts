import { randomUUID } from "node:crypto";
import type { Idea, MediaNotification, TeamMember } from "@/data/media";
import { HONOR_WEIGHTS, type EngagementState, type HonorAward, type HonorBoard, type HonorEntry, type Meeting, type MeetingItem, type MemberProfile, type PersonalTask, type WorkSession } from "@/data/engagement";
import { isAdministrator, requireUser } from "./auth";
import { database, type Queryable } from "./db";
import { assertSameOrigin, MediaServerError, readJson } from "./http";
import { insertNotifications, loadIdeas, loadReference } from "./repository";

type Row = Record<string, unknown>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
const day = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(date);
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const weekday = (value: string) => new Date(`${value}T12:00:00Z`).getUTCDay();
const isWorkDay = (value: string) => weekday(value) !== 5 && weekday(value) !== 6;
const weekStart = (value: string) => addDays(value, -weekday(value));
const monthOf = (value: string) => value.slice(0, 7);
const previousMonth = (month: string) => { const [year, number] = month.split("-").map(Number); return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`; };
const monthEnd = (month: string) => { const [year, number] = month.split("-").map(Number); return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10); };
const text = (value: unknown, max: number, label: string, min = 1) => {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max) throw new MediaServerError(`${label} غير صالح.`, 422, "INVALID_INPUT");
  return result;
};
const optionalId = (value: unknown) => (value === undefined || value === null || value === "" ? null : typeof value === "string" && ID.test(value) ? value : (() => { throw new MediaServerError("معرّف غير صالح.", 422, "INVALID_INPUT"); })());
const uuid = (value: unknown) => { if (typeof value !== "string" || !UUID.test(value)) throw new MediaServerError("معرّف غير صالح.", 422, "INVALID_INPUT"); return value; };
const canManageMeetings = (member: TeamMember) => isAdministrator(member) || member.role === "manager";
const canSeeScores = canManageMeetings;
const eligible = (member: TeamMember) => member.active && member.role !== "superadmin" && member.role !== "manager";

function toTask(row: Row): PersonalTask {
  return { id: String(row.id), title: String(row.title), dueDate: row.due_date ? String(row.due_date) : null, doneAt: iso(row.done_at), ideaId: (row.idea_id as string) || null, meetingId: (row.meeting_id as string) || null, source: row.source as PersonalTask["source"], createdAt: iso(row.created_at)!, createdBy: String(row.created_by) };
}
function toSession(row: Row): WorkSession {
  return { id: String(row.id), memberId: String(row.member_id), ideaId: (row.idea_id as string) || null, taskId: (row.task_id as string) || null, label: String(row.label || ""), startedAt: iso(row.started_at)!, endedAt: iso(row.ended_at), seconds: row.seconds === null || row.seconds === undefined ? null : Number(row.seconds) };
}

export async function recordHeartbeat(q: Queryable, member: TeamMember, now = new Date()) {
  const previous = (await q.query<{ last_seen_at: Date }>("select last_seen_at from wasl.member_presence where member_id = $1 for update", [member.id])).rows[0];
  const gapMinutes = previous ? (now.getTime() - new Date(previous.last_seen_at).getTime()) / 60_000 : Infinity;
  const newVisit = gapMinutes > 30;
  await q.query(`insert into wasl.member_presence (member_id, last_seen_at, previous_visit_at, session_started_at) values ($1, $2, null, $2)
    on conflict (member_id) do update set last_seen_at = $2, previous_visit_at = case when $3 then wasl.member_presence.last_seen_at else wasl.member_presence.previous_visit_at end, session_started_at = case when $3 then $2 else wasl.member_presence.session_started_at end`, [member.id, now.toISOString(), newVisit]);
  const minutes = gapMinutes <= 3 ? Math.max(0, Math.round(gapMinutes)) : 0;
  await q.query(`insert into wasl.member_activity (member_id, day, active_minutes, first_seen_at, last_seen_at) values ($1, $2::date, $3, $4, $4)
    on conflict (member_id, day) do update set active_minutes = least(1440, wasl.member_activity.active_minutes + $3), last_seen_at = $4`, [member.id, day(now), minutes, now.toISOString()]);
}

async function presence(q: Queryable) {
  return (await q.query<{ member_id: string; last_seen_at: Date }>("select member_id, last_seen_at from wasl.member_presence where last_seen_at > now() - interval '30 days'")).rows.map((row) => ({ memberId: row.member_id, lastSeenAt: iso(row.last_seen_at) }));
}

async function loadMeetings(q: Queryable, filter: { ids?: string[]; from?: string; to?: string }): Promise<Meeting[]> {
  const rows = filter.ids
    ? (await q.query("select * from wasl.meetings where id = any($1::uuid[]) order by starts_at", [filter.ids])).rows
    : (await q.query("select * from wasl.meetings where starts_at between $1::timestamptz and $2::timestamptz order by starts_at", [filter.from, filter.to])).rows;
  if (!rows.length) return [];
  const ids = rows.map((row) => String(row.id));
  const [items, attendance] = await Promise.all([
    q.query("select * from wasl.meeting_items where meeting_id = any($1::uuid[]) order by sort, created_at", [ids]),
    q.query("select * from wasl.meeting_attendance where meeting_id = any($1::uuid[]) order by joined_at", [ids]),
  ]);
  return rows.map((row) => ({
    id: String(row.id), title: String(row.title), startsAt: iso(row.starts_at)!, durationMinutes: Number(row.duration_minutes), teamsUrl: (row.teams_url as string) || null, notes: String(row.notes || ""),
    status: row.status as Meeting["status"], createdBy: String(row.created_by), createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!,
    items: items.rows.filter((item) => String(item.meeting_id) === String(row.id)).map((item): MeetingItem => ({ id: String(item.id), kind: item.kind as MeetingItem["kind"], text: String(item.text), ideaId: (item.idea_id as string) || null, assigneeId: (item.assignee_id as string) || null, taskId: (item.task_id as string) || null, done: Boolean(item.done), sort: Number(item.sort), createdBy: String(item.created_by), createdAt: iso(item.created_at)! })),
    attendance: attendance.rows.filter((item) => String(item.meeting_id) === String(row.id)).map((item) => ({ memberId: String(item.member_id), joinedAt: iso(item.joined_at)!, leftAt: iso(item.left_at) })),
  }));
}

function deliveredIn(ideas: Idea[], memberId: string, from: string, to: string) {
  return ideas.filter((idea) => idea.status === "delivered" && idea.deliveredAt && idea.deliveredAt >= from && idea.deliveredAt <= to && (idea.designerId === memberId || idea.ownerId === memberId));
}

function responseHours(ideas: Idea[], memberId: string, from: string, to: string, now: Date) {
  const samples: number[] = [];
  for (const idea of ideas) {
    const history = idea.history;
    history.forEach((event, index) => {
      const at = event.at.slice(0, 10);
      if (at < from || at > to) return;
      const designerTurn = event.action === "scheduled" && idea.designerId === memberId;
      const ownerTurn = (event.action === "changes_requested" || event.action === "edit_request_approved") && idea.ownerId === memberId;
      if (!designerTurn && !ownerTurn) return;
      const reply = history.slice(index + 1).find((next) => next.actorId === memberId && (designerTurn ? ["design_started", "design_review", "delivered"] : ["edited", "submitted"]).includes(next.action));
      const end = reply ? new Date(reply.at).getTime() : now.getTime();
      if (!reply && end - new Date(event.at).getTime() < 48 * 3_600_000) return;
      samples.push(Math.min(168, (end - new Date(event.at).getTime()) / 3_600_000));
    });
  }
  return samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null;
}

export async function computeHonor(q: Queryable, month: string, now = new Date()): Promise<HonorEntry[]> {
  const reference = await loadReference(q);
  const ideas = await loadIdeas(q);
  const from = `${month}-01`, to = monthEnd(month) < day(now) ? monthEnd(month) : day(now);
  const range = [`${from}T00:00:00+03:00`, `${addDays(to, 1)}T00:00:00+03:00`];
  const [messages, comments, active, meetings] = await Promise.all([
    q.query<{ id: string; n: number }>("select author_id as id, count(*)::int as n from wasl.social_messages where deleted_at is null and created_at >= $1 and created_at < $2 group by author_id", range),
    q.query<{ id: string; n: number }>("select actor_id as id, count(*)::int as n from wasl.idea_events where action = 'comment' and at >= $1 and at < $2 group by actor_id", range),
    q.query<{ id: string; n: number }>("select member_id as id, count(*)::int as n from wasl.member_activity where active_minutes >= 5 and day between $1::date and $2::date group by member_id", [from, to]),
    q.query<{ id: string; n: number }>("select member_id as id, count(*)::int as n from wasl.meeting_attendance a join wasl.meetings m on m.id = a.meeting_id where m.starts_at >= $1 and m.starts_at < $2 group by member_id", range),
  ]);
  const count = (rows: { id: string; n: number }[], id: string) => rows.find((row) => row.id === id)?.n || 0;
  let workDays = 0;
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) if (isWorkDay(cursor)) workDays++;
  const base = reference.members.filter(eligible).map((member) => {
    const delivered = deliveredIn(ideas, member.id, from, to);
    const onTime = delivered.length ? delivered.filter((idea) => !idea.dueDate || idea.deliveredAt! <= idea.dueDate).length / delivered.length : null;
    return { member, delivered: delivered.length, onTime, hours: responseHours(ideas, member.id, from, to, now), messages: count(messages.rows, member.id) + count(comments.rows, member.id), activeDays: count(active.rows, member.id), meetings: count(meetings.rows, member.id) };
  });
  const maxDelivered = Math.max(0, ...base.map((entry) => entry.delivered));
  const maxMessages = Math.max(0, ...base.map((entry) => entry.messages));
  const maxMeetings = Math.max(0, ...base.map((entry) => entry.meetings));
  const round = (value: number) => Math.round(value * 10) / 10;
  return base.map((entry): HonorEntry => {
    const completion = maxDelivered ? (entry.delivered / maxDelivered) * HONOR_WEIGHTS.completion : 0;
    const onTime = (entry.onTime ?? 0) * HONOR_WEIGHTS.onTime;
    const response = entry.hours === null ? 0 : Math.max(0, Math.min(1, 1 - (entry.hours - 2) / 46)) * HONOR_WEIGHTS.response;
    const participation = (0.4 * (maxMessages ? entry.messages / maxMessages : 0) + 0.4 * (workDays ? Math.min(1, entry.activeDays / workDays) : 0) + 0.2 * (maxMeetings ? entry.meetings / maxMeetings : 0)) * HONOR_WEIGHTS.participation;
    const breakdown = { completion: round(completion), onTime: round(onTime), response: round(response), participation: round(participation) };
    return { memberId: entry.member.id, score: round(completion + onTime + response + participation), delivered: entry.delivered, onTimeRate: entry.onTime === null ? null : Math.round(entry.onTime * 100), responseHours: entry.hours === null ? null : round(entry.hours), messages: entry.messages, activeDays: entry.activeDays, meetings: entry.meetings, breakdown };
  }).sort((a, b) => b.score - a.score || b.delivered - a.delivered || a.memberId.localeCompare(b.memberId));
}

export async function announceHonor(q: Queryable, today = day()) {
  const month = previousMonth(monthOf(today));
  if ((await q.query("select 1 from wasl.honor_awards where month = $1", [month])).rows.length) return null;
  const claimed = await q.query("insert into wasl.job_runs (key) values ($1) on conflict (key) do nothing returning key", [`honor:${month}`]);
  if (!claimed.rows.length) return null;
  const ranking = await computeHonor(q, month, new Date(`${monthEnd(month)}T20:59:00Z`));
  const winner = ranking[0];
  if (!winner || winner.score <= 0) return null;
  const members = (await loadReference(q)).members;
  const person = members.find((member) => member.id === winner.memberId)!;
  const summary = [`سلّم${person.addressForm === "f" ? "ت" : ""} ${winner.delivered.toLocaleString("ar-SA")} ${winner.delivered === 1 ? "عملاً" : "أعمال"}`, winner.onTimeRate !== null ? `${winner.onTimeRate.toLocaleString("ar-SA")}٪ منها في موعدها` : "", winner.responseHours !== null ? `بمتوسط استجابة ${winner.responseHours.toLocaleString("ar-SA")} ساعة` : "", winner.activeDays ? `وكان${person.addressForm === "f" ? "ت" : ""} حاضر${person.addressForm === "f" ? "ة" : "اً"} ${winner.activeDays.toLocaleString("ar-SA")} يوماً على المنصة` : ""].filter(Boolean).join("، ");
  await q.query("insert into wasl.honor_awards (month, member_id, score, breakdown, summary) values ($1, $2, $3, $4::jsonb, $5) on conflict (month) do nothing", [month, winner.memberId, winner.score, JSON.stringify(winner.breakdown), summary]);
  const label = new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", month: "long", timeZone: "Asia/Riyadh" }).format(new Date(`${month}-15T12:00:00Z`));
  const at = new Date().toISOString();
  await insertNotifications(q, members.filter((member) => member.active).map((member): MediaNotification => ({ id: randomUUID(), recipientId: member.id, ideaId: "", type: "honor", title: member.id === winner.memberId ? `مبروك! أنت الموظف${person.addressForm === "f" ? "ة" : ""} المثالي${person.addressForm === "f" ? "ة" : ""} لشهر ${label}` : `الموظف المثالي لشهر ${label}: ${person.name}`, body: summary, createdAt: at, read: false, entityType: "honor", entityId: month, action: "honor_announced" })));
  return winner;
}

async function honorBoard(q: Queryable, viewer: TeamMember, now = new Date()): Promise<HonorBoard> {
  const month = monthOf(day(now));
  const ranking = await computeHonor(q, month, now);
  const awards = (await q.query("select a.month, a.member_id, a.score, a.breakdown, a.summary, a.announced_at, (select count(*)::int from wasl.honor_cheers c where c.month = a.month) as cheers, exists (select 1 from wasl.honor_cheers c where c.month = a.month and c.from_id = $1) as cheered from wasl.honor_awards a order by a.month desc limit 12", [viewer.id])).rows;
  const scores = canSeeScores(viewer);
  const toAward = (row: Row): HonorAward => ({ month: String(row.month), memberId: String(row.member_id), score: scores ? Number(row.score) : 0, summary: String(row.summary || ""), announcedAt: iso(row.announced_at)!, cheers: Number(row.cheers), cheered: Boolean(row.cheered), ...(scores ? { breakdown: (typeof row.breakdown === "string" ? JSON.parse(row.breakdown) : row.breakdown) as HonorAward["breakdown"] } : {}) });
  const current = awards.find((row) => row.month === previousMonth(month));
  return {
    month,
    podium: ranking.filter((entry) => entry.score > 0).slice(0, 3).map((entry, index) => ({ memberId: entry.memberId, rank: index + 1 })),
    ...(scores ? { ranking } : {}),
    current: current ? toAward(current) : null,
    past: awards.map(toAward),
  };
}

export async function loadEngagement(request: Request): Promise<EngagementState> {
  const db = database();
  const member = await requireUser(request, db);
  const now = new Date(), today = day(now), start = weekStart(today);
  await db.transaction(async (tx) => { await announceHonor(tx, today); }).catch(() => undefined);
  const [tasks, session, running, focusRows, presenceRows, me, weekTasks, ideas, meetings, honor, push, activity] = await Promise.all([
    db.query("select * from wasl.tasks where member_id = $1 and (done_at is null or done_at > now() - interval '7 days') order by done_at nulls first, due_date nulls last, created_at", [member.id]),
    db.query("select * from wasl.work_sessions where member_id = $1 and ended_at is null", [member.id]),
    db.query("select s.member_id, s.idea_id, s.label, s.started_at from wasl.work_sessions s where s.ended_at is null"),
    db.query<{ idea_id: string | null; label: string; seconds: number }>("select idea_id, label, sum(coalesce(seconds, extract(epoch from now() - started_at)))::int as seconds from wasl.work_sessions where member_id = $1 and started_at >= $2::timestamptz group by idea_id, label", [member.id, `${start}T00:00:00+03:00`]),
    presence(db),
    db.query("select previous_visit_at, welcomed_on::text as welcomed_on from wasl.member_presence where member_id = $1", [member.id]),
    db.query<{ day: string; n: number }>("select (done_at at time zone 'Asia/Riyadh')::date::text as day, count(*)::int as n from wasl.tasks where member_id = $1 and done_at >= $2::timestamptz group by 1", [member.id, `${start}T00:00:00+03:00`]),
    loadIdeas(db),
    loadMeetings(db, { from: new Date(now.getTime() - 14 * 86_400_000).toISOString(), to: new Date(now.getTime() + 45 * 86_400_000).toISOString() }),
    honorBoard(db, member, now),
    db.query<{ n: number }>("select count(*)::int as n from wasl.push_subscriptions where member_id = $1", [member.id]),
    db.query<{ day: string }>("select day::text as day from wasl.member_activity where member_id = $1 and active_minutes > 0 and day > $2::date order by day desc", [member.id, addDays(today, -120)]),
  ]);
  const categories = (await loadReference(db)).categories;
  const focus = new Map<string, { label: string; minutes: number; ideaId: string | null }>();
  for (const row of focusRows.rows) {
    const idea = ideas.find((item) => item.id === row.idea_id);
    const label = idea ? categories.find((category) => category.id === idea.categoryId)?.name || "أعمال" : row.label || "مهام شخصية";
    const entry = focus.get(label) || { label, minutes: 0, ideaId: idea ? null : null };
    entry.minutes += Math.round(Number(row.seconds) / 60);
    focus.set(label, entry);
  }
  const week = Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((date) => ({
    day: date,
    done: (weekTasks.rows.find((row) => row.day === date)?.n || 0) + ideas.filter((idea) => idea.status === "delivered" && idea.deliveredAt === date && (idea.designerId === member.id || idea.ownerId === member.id)).length,
  }));
  const activeDays = new Set(activity.rows.map((row) => row.day));
  let streak = 0;
  for (let cursor = activeDays.has(today) ? today : addDays(today, -1); ; cursor = addDays(cursor, -1)) {
    if (!isWorkDay(cursor)) continue;
    if (!activeDays.has(cursor)) break;
    streak++;
    if (streak > 120) break;
  }
  const presenceMap = new Map(presenceRows.map((row) => [row.memberId, row.lastSeenAt]));
  const members = (await loadReference(db)).members.filter((item) => item.active);
  return {
    now: now.toISOString(),
    tasks: tasks.rows.map(toTask),
    session: session.rows[0] ? toSession(session.rows[0]) : null,
    team: members.map((item) => {
      const work = running.rows.find((row) => row.member_id === item.id);
      return { memberId: item.id, lastSeenAt: presenceMap.get(item.id) || null, working: work ? { ideaId: (work.idea_id as string) || null, label: String(work.label || ""), startedAt: iso(work.started_at)! } : null };
    }),
    focus: [...focus.values()].filter((entry) => entry.minutes > 0).sort((a, b) => b.minutes - a.minutes),
    week,
    streak,
    meetings,
    honor,
    welcome: { show: me.rows[0]?.welcomed_on !== today, previousVisitAt: iso(me.rows[0]?.previous_visit_at) },
    push: { publicKey: process.env.WASL_VAPID_PUBLIC_KEY || null, subscribed: push.rows[0]?.n || 0 },
  };
}

export async function loadProfile(request: Request, memberId: string): Promise<MemberProfile> {
  const db = database();
  const viewer = await requireUser(request, db);
  if (!canSeeScores(viewer) && viewer.id !== memberId) throw new MediaServerError("لوحة الإنجاز متاحة لمدير النظام ومدير الإدارة.", 403, "FORBIDDEN");
  if (!ID.test(memberId)) throw new MediaServerError("العضو غير موجود.", 404, "NOT_FOUND");
  const reference = await loadReference(db);
  if (!reference.members.some((member) => member.id === memberId)) throw new MediaServerError("العضو غير موجود.", 404, "NOT_FOUND");
  const now = new Date(), today = day(now), from = addDays(today, -29), heatFrom = addDays(weekStart(today), -28);
  const range = [`${from}T00:00:00+03:00`, now.toISOString()];
  const ideas = await loadIdeas(db);
  const [messages, reactions, comments, meetings, activity, focus, seen] = await Promise.all([
    db.query<{ n: number }>("select count(*)::int as n from wasl.social_messages where author_id = $1 and deleted_at is null and created_at >= $2 and created_at <= $3", [memberId, ...range]),
    db.query<{ n: number }>("select count(*)::int as n from wasl.social_reactions where member_id = $1 and created_at >= $2 and created_at <= $3", [memberId, ...range]),
    db.query<{ n: number }>("select count(*)::int as n from wasl.idea_events where actor_id = $1 and action = 'comment' and at >= $2 and at <= $3", [memberId, ...range]),
    db.query<{ n: number }>("select count(*)::int as n from wasl.meeting_attendance a join wasl.meetings m on m.id = a.meeting_id where a.member_id = $1 and m.starts_at >= $2 and m.starts_at <= $3", [memberId, ...range]),
    db.query<{ day: string; minutes: number }>("select day::text as day, active_minutes as minutes from wasl.member_activity where member_id = $1 and day >= $2::date order by day", [memberId, heatFrom]),
    db.query<{ seconds: number }>("select coalesce(sum(coalesce(seconds, extract(epoch from now() - started_at))), 0)::int as seconds from wasl.work_sessions where member_id = $1 and started_at >= $2", [memberId, range[0]]),
    db.query("select last_seen_at from wasl.member_presence where member_id = $1", [memberId]),
  ]);
  const delivered = deliveredIn(ideas, memberId, from, today);
  const completion = delivered.map((idea) => (new Date(`${idea.deliveredAt}T12:00:00Z`).getTime() - new Date(`${(idea.scheduledAt || idea.requestedAt)}T12:00:00Z`).getTime()) / 86_400_000).filter((value) => Number.isFinite(value) && value >= 0);
  let workDays = 0;
  for (let cursor = from; cursor <= today; cursor = addDays(cursor, 1)) if (isWorkDay(cursor)) workDays++;
  const activeDays = activity.rows.filter((row) => row.day >= from && row.minutes >= 5).length;
  const heatmap = Array.from({ length: 35 }, (_, index) => addDays(heatFrom, index)).map((date) => ({ day: date, minutes: activity.rows.find((row) => row.day === date)?.minutes || 0 }));
  const ranking = await computeHonor(db, monthOf(today), now);
  return {
    memberId, delivered: delivered.length,
    onTimeRate: delivered.length ? Math.round((delivered.filter((idea) => !idea.dueDate || idea.deliveredAt! <= idea.dueDate).length / delivered.length) * 100) : null,
    averageCompletionDays: completion.length ? Math.round((completion.reduce((sum, value) => sum + value, 0) / completion.length) * 10) / 10 : null,
    responseHours: (() => { const value = responseHours(ideas, memberId, from, today, now); return value === null ? null : Math.round(value * 10) / 10; })(),
    ideasCreated: ideas.filter((idea) => idea.history.some((event) => event.action === "created" && event.actorId === memberId && event.at.slice(0, 10) >= from)).length,
    messages: messages.rows[0].n, reactions: reactions.rows[0].n, comments: comments.rows[0].n, meetingsAttended: meetings.rows[0].n,
    activeDays, workDays, activityRate: workDays ? Math.round(Math.min(1, activeDays / workDays) * 100) : 0, heatmap,
    honor: ranking.find((entry) => entry.memberId === memberId) || null,
    focusMinutes: Math.round(Number(focus.rows[0].seconds) / 60), lastSeenAt: iso(seen.rows[0]?.last_seen_at),
  };
}

async function notifyMeeting(q: Queryable, actor: TeamMember, meeting: { id: string; title: string }, recipients: string[], title: string, body: string, action: string) {
  const at = new Date().toISOString();
  await insertNotifications(q, [...new Set(recipients)].filter((id) => id !== actor.id).map((recipientId): MediaNotification => ({ id: randomUUID(), recipientId, ideaId: "", type: "meeting", title, body: `${actor.name} · ${body}`, createdAt: at, read: false, actorId: actor.id, actorName: actor.name, entityType: "meeting", entityId: meeting.id, action })));
}

async function activeMemberIds(q: Queryable) {
  return (await q.query<{ id: string }>("select id from wasl.members where active")).rows.map((row) => row.id);
}

async function lockedMeeting(q: Queryable, id: string) {
  const row = (await q.query("select * from wasl.meetings where id = $1 for update", [id])).rows[0];
  if (!row) throw new MediaServerError("الاجتماع غير موجود.", 404, "NOT_FOUND");
  return row;
}

function meetingTime(value: unknown) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) throw new MediaServerError("حدد موعد الاجتماع.", 422, "INVALID_INPUT");
  return date.toISOString();
}

function teamsLink(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const link = String(value).trim();
  let parsed: URL;
  try { parsed = new URL(link); } catch { throw new MediaServerError("رابط Teams غير صالح.", 422, "INVALID_INPUT"); }
  if (parsed.protocol !== "https:" || link.length > 2000) throw new MediaServerError("استخدم رابط Teams يبدأ بـ https.", 422, "INVALID_INPUT");
  return link;
}

async function assertIdea(q: Queryable, ideaId: string | null) {
  if (ideaId && !(await q.query("select 1 from wasl.ideas where id = $1 and deleted_at is null", [ideaId])).rows.length) throw new MediaServerError("الفكرة غير موجودة.", 404, "NOT_FOUND");
}

export async function engagementAction(request: Request) {
  assertSameOrigin(request);
  const body = (await readJson(request, 64 * 1024)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") throw new MediaServerError("طلب غير صالح.");
  const action = String(body.action || "");
  const db = database();
  return db.transaction(async (tx) => {
    const actor = await requireUser(request, tx);
    switch (action) {
      case "heartbeat": {
        await recordHeartbeat(tx, actor);
        return { online: await presence(tx) };
      }
      case "dismissWelcome": {
        await recordHeartbeat(tx, actor);
        await tx.query("update wasl.member_presence set welcomed_on = $2::date where member_id = $1", [actor.id, day()]);
        return { ok: true };
      }
      case "addTask": {
        const id = uuid(body.id), title = text(body.title, 300, "عنوان المهمة");
        const dueDate = body.dueDate ? String(body.dueDate) : null;
        if (dueDate && !DAY.test(dueDate)) throw new MediaServerError("التاريخ غير صالح.", 422, "INVALID_INPUT");
        const ideaId = optionalId(body.ideaId); await assertIdea(tx, ideaId);
        await tx.query("insert into wasl.tasks (id, member_id, title, due_date, idea_id, source, created_by) values ($1, $2, $3, $4::date, $5, 'quick', $2) on conflict (id) do nothing", [id, actor.id, title, dueDate, ideaId]);
        return { ok: true };
      }
      case "toggleTask": {
        const id = uuid(body.id);
        const updated = await tx.query("update wasl.tasks set done_at = case when $3 then coalesce(done_at, now()) else null end where id = $1 and member_id = $2 returning meeting_id", [id, actor.id, body.done === true]);
        if (!updated.rows.length) throw new MediaServerError("المهمة غير موجودة.", 404, "NOT_FOUND");
        await tx.query("update wasl.meeting_items set done = $2 where task_id = $1", [id, body.done === true]);
        return { ok: true };
      }
      case "deleteTask": {
        await tx.query("delete from wasl.tasks where id = $1 and member_id = $2", [uuid(body.id), actor.id]);
        return { ok: true };
      }
      case "planIdea": {
        const ideaId = optionalId(body.ideaId), dueDate = String(body.day || "");
        if (!ideaId || !DAY.test(dueDate)) throw new MediaServerError("اختر العمل واليوم.", 422, "INVALID_INPUT");
        const idea = (await tx.query("select title from wasl.ideas where id = $1 and deleted_at is null and (owner_id = $2 or designer_id = $2)", [ideaId, actor.id])).rows[0];
        if (!idea) throw new MediaServerError("يمكنك تخطيط أعمالك المسندة إليك فقط.", 403, "FORBIDDEN");
        const existing = (await tx.query("select id from wasl.tasks where member_id = $1 and idea_id = $2 and source = 'plan' and done_at is null", [actor.id, ideaId])).rows[0];
        if (existing) await tx.query("update wasl.tasks set due_date = $2::date where id = $1", [existing.id, dueDate]);
        else await tx.query("insert into wasl.tasks (id, member_id, title, due_date, idea_id, source, created_by) values ($1, $2, $3, $4::date, $5, 'plan', $2)", [randomUUID(), actor.id, `العمل على «${idea.title}»`.slice(0, 300), dueDate, ideaId]);
        return { ok: true };
      }
      case "startSession": {
        const ideaId = optionalId(body.ideaId); await assertIdea(tx, ideaId);
        const taskId = body.taskId ? uuid(body.taskId) : null;
        if (taskId && !(await tx.query("select 1 from wasl.tasks where id = $1 and member_id = $2", [taskId, actor.id])).rows.length) throw new MediaServerError("المهمة غير موجودة.", 404, "NOT_FOUND");
        const label = typeof body.label === "string" ? body.label.trim().slice(0, 300) : "";
        await tx.query("update wasl.work_sessions set ended_at = now(), seconds = least(86400, extract(epoch from now() - started_at))::int where member_id = $1 and ended_at is null", [actor.id]);
        const id = randomUUID();
        await tx.query("insert into wasl.work_sessions (id, member_id, idea_id, task_id, label, started_at) values ($1, $2, $3, $4, $5, now())", [id, actor.id, ideaId, taskId, label]);
        await recordHeartbeat(tx, actor);
        return { ok: true, id };
      }
      case "stopSession": {
        await tx.query("update wasl.work_sessions set ended_at = now(), seconds = least(86400, extract(epoch from now() - started_at))::int where member_id = $1 and ended_at is null", [actor.id]);
        return { ok: true };
      }
      case "createMeeting": {
        if (!canManageMeetings(actor)) throw new MediaServerError("ينشئ الاجتماعات مدير الإدارة أو مدير النظام.", 403, "FORBIDDEN");
        const id = uuid(body.id), title = text(body.title, 200, "عنوان الاجتماع"), startsAt = meetingTime(body.startsAt);
        const duration = Number(body.durationMinutes || 45);
        if (!Number.isInteger(duration) || duration < 5 || duration > 600) throw new MediaServerError("مدة الاجتماع غير صالحة.", 422, "INVALID_INPUT");
        const created = await tx.query("insert into wasl.meetings (id, title, starts_at, duration_minutes, teams_url, created_by) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing returning id", [id, title, startsAt, duration, teamsLink(body.teamsUrl), actor.id]);
        if (created.rows.length) {
          const agenda = Array.isArray(body.agenda) ? body.agenda.slice(0, 30) : [];
          for (const [index, entry] of agenda.entries()) {
            const item = entry as Record<string, unknown>;
            const ideaId = optionalId(item.ideaId); await assertIdea(tx, ideaId);
            await tx.query("insert into wasl.meeting_items (id, meeting_id, kind, text, idea_id, sort, created_by) values ($1, $2, 'agenda', $3, $4, $5, $6)", [randomUUID(), id, text(item.text, 1000, "بند الأجندة"), ideaId, index, actor.id]);
          }
          const when = new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(startsAt));
          await notifyMeeting(tx, actor, { id, title }, await activeMemberIds(tx), `اجتماع جديد: ${title}`, `${when}${agenda.length ? ` · ${agenda.length.toLocaleString("ar-SA")} بنود` : ""}`, "meeting_created");
        }
        return { meeting: (await loadMeetings(tx, { ids: [id] }))[0] };
      }
      case "updateMeeting": {
        const id = uuid(body.id); const row = await lockedMeeting(tx, id);
        const manager = canManageMeetings(actor) || row.created_by === actor.id;
        const patch: string[] = [], values: unknown[] = [id];
        const set = (column: string, value: unknown) => { values.push(value); patch.push(`${column} = $${values.length}`); };
        if (body.notes !== undefined) set("notes", typeof body.notes === "string" ? body.notes.slice(0, 20000) : "");
        if (!manager && ["title", "startsAt", "durationMinutes", "teamsUrl", "status"].some((key) => body[key] !== undefined)) throw new MediaServerError("يعدّل تفاصيل الاجتماع منشئه أو مدير الإدارة.", 403, "FORBIDDEN");
        if (body.title !== undefined) set("title", text(body.title, 200, "عنوان الاجتماع"));
        if (body.startsAt !== undefined) set("starts_at", meetingTime(body.startsAt));
        if (body.durationMinutes !== undefined) { const duration = Number(body.durationMinutes); if (!Number.isInteger(duration) || duration < 5 || duration > 600) throw new MediaServerError("مدة الاجتماع غير صالحة.", 422, "INVALID_INPUT"); set("duration_minutes", duration); }
        if (body.teamsUrl !== undefined) set("teams_url", teamsLink(body.teamsUrl));
        if (body.status !== undefined) { if (!["scheduled", "live", "ended", "cancelled"].includes(String(body.status))) throw new MediaServerError("حالة غير صالحة.", 422, "INVALID_INPUT"); set("status", String(body.status)); }
        if (patch.length) await tx.query(`update wasl.meetings set ${patch.join(", ")}, updated_at = now() where id = $1`, values);
        if (body.status === "live" && row.status !== "live") await notifyMeeting(tx, actor, { id, title: String(row.title) }, await activeMemberIds(tx), `بدأ الاجتماع: ${row.title}`, "انضم الآن من غرفة الاجتماع", "meeting_started");
        if (body.status === "cancelled" && row.status !== "cancelled") await notifyMeeting(tx, actor, { id, title: String(row.title) }, await activeMemberIds(tx), `أُلغي الاجتماع: ${row.title}`, "تم إلغاء الاجتماع", "meeting_cancelled");
        if (body.status === "ended") await tx.query("update wasl.meeting_attendance set left_at = coalesce(left_at, now()) where meeting_id = $1", [id]);
        return { meeting: (await loadMeetings(tx, { ids: [id] }))[0] };
      }
      case "addMeetingItem": {
        const meetingId = uuid(body.meetingId); const row = await lockedMeeting(tx, meetingId);
        const kind = String(body.kind);
        if (!["agenda", "decision", "action"].includes(kind)) throw new MediaServerError("نوع البند غير صالح.", 422, "INVALID_INPUT");
        if (row.status === "cancelled") throw new MediaServerError("الاجتماع ملغى.", 409, "INVALID_TRANSITION");
        const ideaId = optionalId(body.ideaId); await assertIdea(tx, ideaId);
        const assigneeId = optionalId(body.assigneeId);
        if (assigneeId && !(await tx.query("select 1 from wasl.members where id = $1 and active", [assigneeId])).rows.length) throw new MediaServerError("العضو غير موجود.", 404, "NOT_FOUND");
        const sort = (await tx.query<{ n: number }>("select coalesce(max(sort), -1)::int + 1 as n from wasl.meeting_items where meeting_id = $1 and kind = $2", [meetingId, kind])).rows[0].n;
        const itemId = randomUUID(), itemText = text(body.text, 1000, "نص البند");
        let taskId: string | null = null;
        if (kind === "action" && assigneeId) {
          taskId = randomUUID();
          await tx.query("insert into wasl.tasks (id, member_id, title, due_date, idea_id, meeting_id, source, created_by) values ($1, $2, $3, $4::date, $5, $6, 'meeting', $7)", [taskId, assigneeId, itemText.slice(0, 300), body.dueDate && DAY.test(String(body.dueDate)) ? String(body.dueDate) : null, ideaId, meetingId, actor.id]);
          await notifyMeeting(tx, actor, { id: meetingId, title: String(row.title) }, [assigneeId], "مهمة جديدة من الاجتماع", itemText, "meeting_action");
        }
        await tx.query("insert into wasl.meeting_items (id, meeting_id, kind, text, idea_id, assignee_id, task_id, sort, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [itemId, meetingId, kind, itemText, ideaId, assigneeId, taskId, sort, actor.id]);
        return { meeting: (await loadMeetings(tx, { ids: [meetingId] }))[0] };
      }
      case "updateMeetingItem": {
        const itemId = uuid(body.id);
        const item = (await tx.query("select i.*, m.created_by as meeting_owner from wasl.meeting_items i join wasl.meetings m on m.id = i.meeting_id where i.id = $1 for update of i", [itemId])).rows[0];
        if (!item) throw new MediaServerError("البند غير موجود.", 404, "NOT_FOUND");
        if (body.remove === true) {
          if (!(canManageMeetings(actor) || item.created_by === actor.id || item.meeting_owner === actor.id)) throw new MediaServerError("يحذف البند كاتبه أو مدير الاجتماع.", 403, "FORBIDDEN");
          await tx.query("delete from wasl.meeting_items where id = $1", [itemId]);
          if (item.task_id) await tx.query("delete from wasl.tasks where id = $1 and done_at is null", [item.task_id]);
        } else {
          if (body.done !== undefined) {
            await tx.query("update wasl.meeting_items set done = $2 where id = $1", [itemId, body.done === true]);
            if (item.task_id) await tx.query("update wasl.tasks set done_at = case when $2 then coalesce(done_at, now()) else null end where id = $1", [item.task_id, body.done === true]);
          }
          if (body.text !== undefined) await tx.query("update wasl.meeting_items set text = $2 where id = $1", [itemId, text(body.text, 1000, "نص البند")]);
        }
        return { meeting: (await loadMeetings(tx, { ids: [String(item.meeting_id)] }))[0] };
      }
      case "joinMeeting":
      case "leaveMeeting": {
        const meetingId = uuid(body.meetingId); const row = await lockedMeeting(tx, meetingId);
        if (row.status === "cancelled") throw new MediaServerError("الاجتماع ملغى.", 409, "INVALID_TRANSITION");
        if (action === "joinMeeting") await tx.query("insert into wasl.meeting_attendance (meeting_id, member_id) values ($1, $2) on conflict (meeting_id, member_id) do update set left_at = null", [meetingId, actor.id]);
        else await tx.query("update wasl.meeting_attendance set left_at = now() where meeting_id = $1 and member_id = $2", [meetingId, actor.id]);
        await recordHeartbeat(tx, actor);
        return { meeting: (await loadMeetings(tx, { ids: [meetingId] }))[0] };
      }
      case "cheer": {
        const month = String(body.month || "");
        if (!MONTH.test(month)) throw new MediaServerError("الشهر غير صالح.", 422, "INVALID_INPUT");
        const award = (await tx.query("select member_id from wasl.honor_awards where month = $1", [month])).rows[0];
        if (!award) throw new MediaServerError("لا يوجد فائز لهذا الشهر.", 404, "NOT_FOUND");
        if (award.member_id === actor.id) throw new MediaServerError("لا يمكنك تهنئة نفسك، لكن مبروك!", 409, "SELF_CHEER");
        const added = await tx.query("insert into wasl.honor_cheers (month, from_id) values ($1, $2) on conflict do nothing returning 1", [month, actor.id]);
        if (added.rows.length) await insertNotifications(tx, [{ id: randomUUID(), recipientId: String(award.member_id), ideaId: "", type: "honor", title: "تهنئة جديدة", body: `${actor.name} هنّأك على لقب الموظف المثالي`, createdAt: new Date().toISOString(), read: false, actorId: actor.id, actorName: actor.name, entityType: "honor", entityId: month, action: "honor_cheer" }]);
        return { ok: true };
      }
      case "subscribePush": {
        const subscription = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
        const endpoint = String(subscription?.endpoint || ""), p256dh = String(subscription?.keys?.p256dh || ""), auth = String(subscription?.keys?.auth || "");
        if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !auth || auth.length > 100) throw new MediaServerError("اشتراك الإشعارات غير صالح.", 422, "INVALID_INPUT");
        await tx.query("insert into wasl.push_subscriptions (id, member_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5, $6) on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth, failures = 0", [randomUUID(), actor.id, endpoint, p256dh, auth, (request.headers.get("user-agent") || "").slice(0, 300)]);
        return { ok: true };
      }
      case "unsubscribePush": {
        await tx.query("delete from wasl.push_subscriptions where endpoint = $1 and member_id = $2", [String(body.endpoint || ""), actor.id]);
        return { ok: true };
      }
      case "setAddressForm": {
        if (!isAdministrator(actor)) throw new MediaServerError("صيغة المخاطبة يحددها مدير النظام.", 403, "FORBIDDEN");
        const memberId = optionalId(body.memberId), form = String(body.form);
        if (!memberId || !["m", "f"].includes(form)) throw new MediaServerError("بيانات غير صالحة.", 422, "INVALID_INPUT");
        const updated = await tx.query("update wasl.members set address_form = $2, updated_at = now() where id = $1 returning id", [memberId, form]);
        if (!updated.rows.length) throw new MediaServerError("العضو غير موجود.", 404, "NOT_FOUND");
        return { ok: true };
      }
      default:
        throw new MediaServerError("إجراء غير معروف.");
    }
  });
}

export async function runMeetingReminders(q: Queryable = database()) {
  const due = (await q.query<{ id: string; title: string; starts_at: Date; created_by: string }>("update wasl.meetings set reminded_at = now() where status = 'scheduled' and reminded_at is null and starts_at between now() and now() + interval '20 minutes' returning id, title, starts_at, created_by")).rows;
  if (!due.length) return 0;
  const members = await activeMemberIds(q);
  const at = new Date().toISOString();
  for (const meeting of due) {
    const minutes = Math.max(1, Math.round((new Date(meeting.starts_at).getTime() - Date.now()) / 60_000));
    await insertNotifications(q, members.map((recipientId): MediaNotification => ({ id: randomUUID(), recipientId, ideaId: "", type: "meeting", title: `${meeting.title} يبدأ بعد ${minutes.toLocaleString("ar-SA")} دقيقة`, body: "جهّز ملاحظاتك وانضم من غرفة الاجتماع", createdAt: at, read: false, entityType: "meeting", entityId: meeting.id, action: "meeting_reminder" })));
  }
  return due.length;
}
