import { randomUUID } from "node:crypto";
import type { NotificationEntity, Attachment, Company, ContentCategory, HistoryEvent, Idea, MediaData, MediaNotification, Quotation, SystemSettings, TeamMember } from "@/data/media";
import type { Queryable } from "./db";

export const DEFAULT_LOGO_URL = "/assets/media/department-logo.png";
type Row = Record<string, unknown>;

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? new Date(String(value)).toISOString() : "");
const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const optionalText = (value: unknown) => (value === null || value === undefined || value === "" ? undefined : String(value));
const textArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.replace(/^\{|\}$/g, "").split(",").filter(Boolean) : []);

export function attachmentUrl(row: Row) {
  if (row.storage === "external") return text(row.external_url);
  if (row.storage === "drive" || row.storage === "supabase") return `/api/files/${row.id}${row.inline_mime ? "?inline=1" : ""}`;
  return `/api/files/${row.id}${row.inline_mime ? "?inline=1" : ""}`;
}

export function toAttachment(row: Row): Attachment {
  return { id: text(row.id), name: text(row.name), size: Number(row.size), mime: text(row.mime), url: attachmentUrl(row), kind: row.kind as Attachment["kind"], ...(row.channel ? { channel: row.channel as Attachment["channel"] } : {}), createdAt: iso(row.created_at) };
}

function toMember(row: Row): TeamMember {
  return { id: text(row.id), name: text(row.name), role: row.role as TeamMember["role"], title: text(row.title), initials: text(row.initials), color: text(row.color), active: Boolean(row.active) };
}

export async function loadReference(q: Queryable): Promise<Pick<MediaData, "members" | "companies" | "categories" | "settings">> {
  const [members, companies, categories, settings] = await Promise.all([
    q.query("select id, name, role::text as role, title, initials, color, active from wasl.members order by created_at, id"),
    q.query("select id, name, short_name, initials, color, active from wasl.companies order by sort_order, created_at"),
    q.query("select id, name, color, target_per_month, active from wasl.categories order by created_at, id"),
    q.query("select department_name, organization_name, logo_attachment_id from wasl.settings where id"),
  ]);
  const setting = settings.rows[0];
  const systemSettings: SystemSettings = { departmentName: text(setting?.department_name) || "إدارة التواصل الداخلي", organizationName: text(setting?.organization_name), logoUrl: setting?.logo_attachment_id ? `/api/files/${setting.logo_attachment_id}?inline=1` : DEFAULT_LOGO_URL, driveFolderId: "" };
  return {
    members: members.rows.map(toMember),
    companies: companies.rows.map((row): Company => ({ id: text(row.id), name: text(row.name), shortName: text(row.short_name), initials: text(row.initials), color: text(row.color), active: row.active !== false })),
    categories: categories.rows.map((row): ContentCategory => ({ id: text(row.id), name: text(row.name), color: text(row.color), targetPerMonth: Number(row.target_per_month), active: row.active !== false })),
    settings: systemSettings,
  };
}

const IDEA_COLUMNS = `id, code, title, company_id, department, category_id, work_type::text as work_type, description, content, execution_plan, channels::text[] as channels,
  owner_id, coalesce(designer_id, '') as designer_id, requested_at::text as requested_at, due_date::text as due_date, coalesce(scheduled_at::text, '') as scheduled_at,
  approved_at, delivered_at::text as delivered_at, priority::text as priority, status::text as status, needs_quotes, manager_feedback, source_proposal, created_at, updated_at, archive_status::text as archive_status, archived_at, drive_folder_id, deleted_at, deleted_by, deletion_reason`;

export async function loadIdeas(q: Queryable, filter: { ids?: string[]; includeDeleted?: boolean } = {}): Promise<Idea[]> {
  const clauses = [...(filter.ids ? ["id = any($1::text[])"] : []), ...(filter.includeDeleted ? [] : ["deleted_at is null"])];
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const params = filter.ids ? [filter.ids] : [];
  const ideas = await q.query(`select ${IDEA_COLUMNS} from wasl.ideas ${where} order by created_at desc, id`, params);
  if (!ideas.rows.length) return [];
  const ids = ideas.rows.map((row) => text(row.id));
  const [events, files, quotes] = await Promise.all([
    q.query("select id, idea_id, at, actor_id, action, note, from_status::text as from_status, to_status::text as to_status from wasl.idea_events where idea_id = any($1::text[]) order by at, id", [ids]),
    q.query("select id, idea_id, kind::text as kind, channel::text as channel, name, size, mime, storage::text as storage, external_url, inline_mime, created_at from wasl.attachments where idea_id = any($1::text[]) and removed_at is null order by created_at, id", [ids]),
    q.query("select id, idea_id, vendor, amount, scope, days, attachment_id, recommended from wasl.quotations where idea_id = any($1::text[]) order by created_at, id", [ids]),
  ]);
  const group = <T,>(rows: Row[], map: (row: Row) => T) => rows.reduce((all, row) => all.set(text(row.idea_id), [...(all.get(text(row.idea_id)) || []), map(row)]), new Map<string, T[]>());
  const history = group(events.rows, (row): HistoryEvent => ({ id: text(row.id), at: iso(row.at), actorId: text(row.actor_id), action: row.action as HistoryEvent["action"], note: text(row.note), ...(row.from_status ? { from: row.from_status as HistoryEvent["from"] } : {}), ...(row.to_status ? { to: row.to_status as HistoryEvent["to"] } : {}) }));
  const attachments = group(files.rows, toAttachment);
  const quotations = group(quotes.rows, (row): Quotation => ({ id: text(row.id), vendor: text(row.vendor), amount: Number(row.amount), scope: text(row.scope), days: Number(row.days), ...(row.attachment_id ? { attachmentId: text(row.attachment_id) } : {}), recommended: Boolean(row.recommended) }));
  return ideas.rows.map((row) => {
    const id = text(row.id);
    const idea: Idea = {
      id, code: text(row.code), title: text(row.title), companyId: text(row.company_id), department: text(row.department), categoryId: text(row.category_id), workType: row.work_type as Idea["workType"],
      description: text(row.description), content: text(row.content), executionPlan: text(row.execution_plan), channels: textArray(row.channels) as Idea["channels"], ownerId: text(row.owner_id), designerId: text(row.designer_id),
      requestedAt: text(row.requested_at), dueDate: text(row.due_date), scheduledAt: text(row.scheduled_at), priority: row.priority as Idea["priority"], status: row.status as Idea["status"], needsQuotes: Boolean(row.needs_quotes),
      quotations: quotations.get(id) || [], attachments: attachments.get(id) || [], managerFeedback: text(row.manager_feedback), history: history.get(id) || [], createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    };
    const deliveredAt = optionalText(row.delivered_at), approvedAt = row.approved_at ? iso(row.approved_at) : undefined;
    if (row.deleted_at) { idea.deletedAt = iso(row.deleted_at); idea.deletedBy = text(row.deleted_by); idea.deletionReason = text(row.deletion_reason); }
    if (deliveredAt) idea.deliveredAt = deliveredAt;
    if (approvedAt) idea.approvedAt = approvedAt;
    idea.archive = { status: row.archive_status as NonNullable<Idea["archive"]>["status"], ...(row.archived_at ? { archivedAt: iso(row.archived_at) } : {}), ...(row.drive_folder_id ? { folderUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(text(row.drive_folder_id))}` } : {}) };
    if (row.source_proposal) idea.sourceProposal = (typeof row.source_proposal === "string" ? JSON.parse(row.source_proposal) : row.source_proposal) as Idea["sourceProposal"];
    return idea;
  });
}

export async function lockIdea(q: Queryable, id: string, includeDeleted = false) {
  const locked = await q.query("select id from wasl.ideas where id = $1 and ($2::boolean or deleted_at is null) for update", [id, includeDeleted]);
  if (!locked.rows.length) return null;
  return (await loadIdeas(q, { ids: [id], includeDeleted }))[0] || null;
}

export async function nextIdeaCode(q: Queryable, year: number) {
  const row = (await q.query<{ last_value: number }>("insert into wasl.code_counters (year, last_value) values ($1, 1) on conflict (year) do update set last_value = wasl.code_counters.last_value + 1 returning last_value", [year])).rows[0];
  return `IC-${year}-${String(row.last_value).padStart(3, "0")}`;
}

const ideaValues = (idea: Idea) => [idea.title, idea.companyId, idea.department, idea.categoryId, idea.workType, idea.description, idea.content, idea.executionPlan, `{${idea.channels.join(",")}}`, idea.ownerId, idea.designerId || null, idea.requestedAt, idea.dueDate, idea.scheduledAt || null, idea.approvedAt || null, idea.deliveredAt || null, idea.priority, idea.status, idea.needsQuotes, idea.managerFeedback, idea.updatedAt];

export async function persistIdea(q: Queryable, before: Idea | null, after: Idea, actorId: string) {
  if (!before) {
    await q.query(`insert into wasl.ideas (title, company_id, department, category_id, work_type, description, content, execution_plan, channels, owner_id, designer_id, requested_at, due_date, scheduled_at, approved_at, delivered_at, priority, status, needs_quotes, manager_feedback, updated_at, id, code, created_at, source_proposal)
      values ($1, $2, $3, $4, $5::wasl.work_type, $6, $7, $8, $9::wasl.channel[], $10, $11, $12::date, $13::date, $14::date, $15::timestamptz, $16::date, $17::wasl.priority, $18::wasl.idea_status, $19, $20, $21::timestamptz, $22, $23, $24::timestamptz, $25::jsonb)`,
    [...ideaValues(after), after.id, after.code, after.createdAt, after.sourceProposal ? JSON.stringify(after.sourceProposal) : null]);
  } else {
    await q.query(`update wasl.ideas set title = $1, company_id = $2, department = $3, category_id = $4, work_type = $5::wasl.work_type, description = $6, content = $7, execution_plan = $8, channels = $9::wasl.channel[], owner_id = $10, designer_id = $11,
      requested_at = $12::date, due_date = $13::date, scheduled_at = $14::date, approved_at = $15::timestamptz, delivered_at = $16::date, priority = $17::wasl.priority, status = $18::wasl.idea_status, needs_quotes = $19, manager_feedback = $20, updated_at = $21::timestamptz,
      approved_by = case when $18::wasl.idea_status = 'approved' and status <> 'approved' then $23 else approved_by end, revision = revision + 1 where id = $22`, [...ideaValues(after), after.id, actorId]);
  }
  if (before?.deletedAt !== after.deletedAt) await q.query("update wasl.ideas set deleted_at = $2::timestamptz, deleted_by = $3, deletion_reason = $4 where id = $1", [after.id, after.deletedAt || null, after.deletedBy || null, after.deletionReason || ""]);
  const known = new Set((before?.history || []).map((event) => event.id));
  for (const event of after.history.filter((item) => !known.has(item.id))) {
    await q.query("insert into wasl.idea_events (id, idea_id, at, actor_id, action, note, from_status, to_status) values ($1, $2, $3::timestamptz, $4, $5, $6, $7::wasl.idea_status, $8::wasl.idea_status)", [event.id, after.id, event.at, event.actorId, event.action, event.note, event.from || null, event.to || null]);
  }
  const beforeFiles = new Set((before?.attachments || []).map((file) => file.id)), afterFiles = new Set(after.attachments.map((file) => file.id));
  for (const id of afterFiles) if (!beforeFiles.has(id)) {
    const linked = await q.query("update wasl.attachments set idea_id = $1, linked_at = now(), requested_idea_id = null where id = $2 and idea_id is null and removed_at is null returning id", [after.id, id]);
    if (linked.rows.length !== 1) throw new Error("Attachment link race");
  }
  for (const id of beforeFiles) if (!afterFiles.has(id)) await q.query("update wasl.attachments set removed_at = now() where id = $1 and idea_id = $2", [id, after.id]);
  const beforeQuotes = new Set((before?.quotations || []).map((quote) => quote.id)), afterQuotes = new Set(after.quotations.map((quote) => quote.id));
  for (const id of beforeQuotes) if (!afterQuotes.has(id)) await q.query("delete from wasl.quotations where id = $1 and idea_id = $2", [id, after.id]);
  await q.query("update wasl.quotations set recommended = false where idea_id = $1 and recommended", [after.id]);
  for (const quote of after.quotations) {
    if (!beforeQuotes.has(quote.id)) await q.query("insert into wasl.quotations (id, idea_id, vendor, amount, scope, days, attachment_id, recommended) values ($1, $2, $3, $4, $5, $6, $7, false)", [quote.id, after.id, quote.vendor, quote.amount, quote.scope, quote.days, quote.attachmentId || null]);
    if (quote.recommended) await q.query("update wasl.quotations set recommended = true where id = $1", [quote.id]);
  }
}

export async function insertNotifications(q: Queryable, notices: MediaNotification[]) {
  // One statement per event's recipients; transaction commit drives the shared realtime cursor.
  if (!notices.length) return;
  const unique = [...new Map(notices.map((notice) => [notice.id, notice])).values()];
  for (const notice of unique) await q.query("insert into wasl.notifications (id, recipient_id, idea_id, type, title, body, created_at, actor_id, actor_name, entity_type, entity_id, action) select $1, $2, $3, $4::wasl.notification_type, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12 where exists (select 1 from wasl.members where id = $2 and active) on conflict (id) do nothing", [notice.id, notice.recipientId, notice.ideaId || null, notice.type, notice.title, notice.body, notice.createdAt, notice.actorId || null, notice.actorName || null, notice.entityType || (notice.ideaId ? "idea" : "workspace"), notice.entityId || notice.ideaId || null, notice.action || null]);
}

export interface WorkspaceActivityInput { entityType: NotificationEntity; entityId: string; action: string; title: string; body: string; recipients?: string[]; type?: MediaNotification["type"] }
export async function notifyWorkspaceActivity(q: Queryable, actor: TeamMember, input: WorkspaceActivityInput): Promise<void> {
  const recipients = await q.query<{ id: string }>("select id from wasl.members where active and (role = 'manager' or id = any($1::text[])) order by id", [input.recipients || []]);
  const at = new Date().toISOString();
  await insertNotifications(q, recipients.rows.map(({ id }) => ({ id: randomUUID(), recipientId: id, ideaId: input.entityType === "idea" ? input.entityId : "", type: input.type || "activity", title: input.title, body: `${actor.name} · ${input.body}`, createdAt: at, read: false, actorId: actor.id, actorName: actor.name, entityType: input.entityType, entityId: input.entityId, action: input.action })));
}

export const NOTIFICATION_PAGE = 50;

export async function loadNotifications(q: Queryable, memberId: string, options: { before?: { createdAt: string; id: string } } = {}): Promise<MediaNotification[]> {
  const rows = options.before
    ? await q.query("select id, recipient_id, idea_id, type::text as type, title, body, created_at, read_at, actor_id, actor_name, entity_type, entity_id, action from wasl.notifications where recipient_id = $1 and (created_at, id) < ($2::timestamptz, $3) order by created_at desc, id desc limit $4", [memberId, options.before.createdAt, options.before.id, NOTIFICATION_PAGE + 1])
    : await q.query(`with latest as (select id from wasl.notifications where recipient_id = $1 order by created_at desc, id desc limit $2)
        select id, recipient_id, idea_id, type::text as type, title, body, created_at, read_at, actor_id, actor_name, entity_type, entity_id, action from wasl.notifications n
        where recipient_id = $1 and (id in (select id from latest) or read_at is null)
        order by created_at desc, id desc limit 300`, [memberId, NOTIFICATION_PAGE]);
  return rows.rows.map((row) => ({ id: text(row.id), recipientId: text(row.recipient_id), ideaId: text(row.idea_id), type: row.type as MediaNotification["type"], title: text(row.title), body: text(row.body), createdAt: iso(row.created_at), read: Boolean(row.read_at), ...(row.actor_id ? { actorId: text(row.actor_id) } : {}), ...(row.actor_name ? { actorName: text(row.actor_name) } : {}), ...(row.entity_type ? { entityType: row.entity_type as NotificationEntity } : {}), ...(row.entity_id ? { entityId: text(row.entity_id) } : {}), ...(row.action ? { action: text(row.action) } : {}) }));
}
