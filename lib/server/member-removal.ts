import { randomUUID } from "node:crypto";
import type { MediaNotification, TeamMember } from "@/data/media";
import { FORMER_MEMBER_ID } from "@/data/media";
import type { Queryable } from "./db";
import { MediaServerError } from "./http";
import { insertNotifications } from "./repository";

const OPEN = ["draft", "quotations", "review", "changes", "approved", "scheduled", "designing", "design_review"];
const ID = /^[A-Za-z0-9_-]{1,100}$/;

export interface RemovalInput { memberId: unknown; ownerReplacementId?: unknown; designerReplacementId?: unknown; confirmName?: unknown }
export interface RemovalPlan { openOwned: number; openDesigned: number; meetingTasks: number; upcomingMeetings: number }

export async function removalPlan(q: Queryable, memberId: string): Promise<RemovalPlan> {
  const [owned, designed, tasks, meetings] = await Promise.all([
    q.query<{ n: number }>("select count(*)::int as n from wasl.ideas where owner_id = $1 and deleted_at is null and status::text = any($2::text[])", [memberId, OPEN]),
    q.query<{ n: number }>("select count(*)::int as n from wasl.ideas where designer_id = $1 and deleted_at is null and status::text = any($2::text[])", [memberId, OPEN]),
    q.query<{ n: number }>("select count(*)::int as n from wasl.tasks where member_id = $1 and source = 'meeting' and done_at is null", [memberId]),
    q.query<{ n: number }>("select count(*)::int as n from wasl.meetings where created_by = $1 and status in ('scheduled', 'live')", [memberId]),
  ]);
  return { openOwned: owned.rows[0].n, openDesigned: designed.rows[0].n, meetingTasks: tasks.rows[0].n, upcomingMeetings: meetings.rows[0].n };
}

async function activeMember(q: Queryable, id: unknown, label: string) {
  if (typeof id !== "string" || !ID.test(id)) throw new MediaServerError(`اختر ${label}.`, 422, "REPLACEMENT_REQUIRED");
  const row = (await q.query<{ id: string; name: string; role: TeamMember["role"] }>("select id, name, role::text as role from wasl.members where id = $1 and active", [id])).rows[0];
  if (!row) throw new MediaServerError(`${label} غير متاح.`, 422, "REPLACEMENT_REQUIRED");
  return row;
}

/** Deletes a member and their personal data. Open work moves to replacements; past history is kept under the former-member placeholder. */
export async function removeMember(q: Queryable, actor: TeamMember, input: RemovalInput) {
  const memberId = typeof input.memberId === "string" && ID.test(input.memberId) ? input.memberId : "";
  if (!memberId) throw new MediaServerError("اختر العضو المراد حذفه.", 422, "INVALID_ACCOUNT");
  if (memberId === "root" || memberId === FORMER_MEMBER_ID) throw new MediaServerError("هذا الحساب محمي ولا يمكن حذفه.", 403, "ROOT_PROTECTED");
  if (memberId === actor.id) throw new MediaServerError("لا يمكنك حذف حسابك بنفسك. يحذفه مدير نظام آخر.", 403, "SELF_DELETE");
  const member = (await q.query<{ id: string; name: string; role: TeamMember["role"]; active: boolean }>("select id, name, role::text as role, active from wasl.members where id = $1 for update", [memberId])).rows[0];
  if (!member) throw new MediaServerError("العضو غير موجود.", 404, "MEMBER_NOT_FOUND");
  if (typeof input.confirmName !== "string" || input.confirmName.trim() !== member.name.trim()) throw new MediaServerError("اكتب اسم العضو كما هو لتأكيد الحذف النهائي.", 422, "CONFIRMATION_REQUIRED");
  if (["admin", "superadmin"].includes(member.role) && member.active) {
    const others = (await q.query<{ n: number }>("select count(*)::int as n from wasl.members where active and role in ('admin', 'superadmin') and id <> $1", [memberId])).rows[0].n;
    if (!others) throw new MediaServerError("يجب إبقاء مدير نظام واحد فعال على الأقل.", 409, "ADMIN_REQUIRED");
  }
  const plan = await removalPlan(q, memberId);
  const needsOwner = plan.openOwned + plan.meetingTasks + plan.upcomingMeetings > 0;
  const owner = needsOwner ? await activeMember(q, input.ownerReplacementId, "البديل الذي تُسند إليه الأعمال") : null;
  if (owner && owner.id === memberId) throw new MediaServerError("اختر عضواً آخر غير العضو المحذوف.", 422, "REPLACEMENT_REQUIRED");
  if (owner && plan.openOwned && !["content", "admin", "superadmin"].includes(owner.role)) throw new MediaServerError("الأفكار المفتوحة تحتاج بديلاً من فريق المحتوى والتنسيق أو مدير نظام.", 422, "REPLACEMENT_ROLE");
  const designer = plan.openDesigned ? await activeMember(q, input.designerReplacementId, "المصمم البديل") : null;
  if (designer && (designer.id === memberId || designer.role !== "designer")) throw new MediaServerError("اختر مصمماً فعالاً آخر للأعمال التي في مرحلة التصميم.", 422, "REPLACEMENT_ROLE");

  const at = new Date().toISOString();
  const moved = new Map<string, string[]>();
  const reassign = async (column: "owner_id" | "designer_id", to: { id: string; name: string }) => {
    const ideas = (await q.query<{ id: string; title: string }>(`update wasl.ideas set ${column} = $2, updated_at = now(), revision = revision + 1 where ${column} = $1 and deleted_at is null and status::text = any($3::text[]) returning id, title`, [memberId, to.id, OPEN])).rows;
    for (const idea of ideas) {
      await q.query("insert into wasl.idea_events (id, idea_id, at, actor_id, action, note) values ($1, $2, $3::timestamptz, $4, 'reassigned', $5)", [randomUUID(), idea.id, at, actor.id, `أُعيد إسناد العمل إلى ${to.name} بعد حذف حساب ${member.name}`]);
      moved.set(to.id, [...(moved.get(to.id) || []), idea.title]);
    }
  };
  if (owner) await reassign("owner_id", owner);
  if (designer) await reassign("designer_id", designer);
  if (owner) {
    const tasks = await q.query("update wasl.tasks set member_id = $2 where member_id = $1 and source = 'meeting' and done_at is null returning id", [memberId, owner.id]);
    await q.query("update wasl.meeting_items set assignee_id = $2 where assignee_id = $1 and task_id = any($3::uuid[])", [memberId, owner.id, tasks.rows.map((row) => row.id)]);
    await q.query("update wasl.meetings set created_by = $2, updated_at = now() where created_by = $1 and status in ('scheduled', 'live')", [memberId, owner.id]);
  }
  await q.query("delete from wasl.idea_edit_requests where requester_id = $1 and status = 'pending'", [memberId]);
  await q.query("delete from wasl.social_reactions where member_id = $1", [memberId]);
  await q.query("delete from wasl.operation_receipts where actor_id = $1", [memberId]);
  await q.query("update wasl.notifications set actor_id = null where actor_id = $1", [memberId]);

  await q.query("insert into wasl.members (id, name, role, title, initials, color, active) values ($1, 'عضو سابق', 'content', 'حساب محذوف', 'س', '#9AA3B5', false) on conflict (id) do nothing", [FORMER_MEMBER_ID]);
  const references = (await q.query<{ tbl: string; col: string; rule: string }>(`select c.conrelid::regclass::text as tbl, a.attname as col, c.confdeltype as rule
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'wasl.members'::regclass`)).rows;
  for (const reference of references) {
    if (reference.rule === "c" || reference.rule === "n") continue;
    const table = reference.tbl.startsWith("wasl.") ? reference.tbl : `wasl.${reference.tbl}`;
    if (!/^wasl\.[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(reference.col)) throw new MediaServerError("تعذّر إكمال الحذف.", 500, "REMOVAL_FAILED");
    await q.query(`update ${table} set "${reference.col}" = $2 where "${reference.col}" = $1`, [memberId, FORMER_MEMBER_ID]);
  }
  await q.query("delete from wasl.members where id = $1", [memberId]);

  const notices: MediaNotification[] = [...moved.entries()].map(([recipientId, titles]) => ({
    id: randomUUID(), recipientId, ideaId: "", type: "assignment", title: titles.length === 1 ? "أُسند إليك عمل جديد" : `أُسندت إليك ${titles.length.toLocaleString("ar-SA")} أعمال جديدة`,
    body: `${actor.name} · كانت لدى ${member.name}: ${titles.slice(0, 3).join("، ")}${titles.length > 3 ? "…" : ""}`, createdAt: at, read: false, actorId: actor.id, actorName: actor.name, entityType: "member", entityId: recipientId, action: "member_removed",
  }));
  await insertNotifications(q, notices);
  return { name: member.name, reassigned: [...moved.values()].reduce((sum, list) => sum + list.length, 0) };
}
