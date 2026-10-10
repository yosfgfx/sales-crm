import { randomUUID } from "node:crypto";
import type { Attachment, Idea, IdeaPatch, MediaData, NewIdeaInput, Quotation, ScheduleInput, SystemSettings, TeamMember } from "@/data/media";
import {
  addMediaAttachments, addMediaCategory, addMediaComment, addMediaCompany, addMediaQuotation, canDeleteIdea, cancelMediaIdea, changeMediaDesignStatus, createMediaIdea, patchMediaIdea,
  reassignMediaIdea, removeMediaAttachment, updateMediaCategory, updateMediaCompany, removeMediaQuotation, reopenMediaIdea, reviewMediaIdea, scheduleMediaIdea, submitMediaIdea, updateMediaSettings, validateMediaData, withdrawMediaIdea,
} from "@/lib/media-workflow";
import { isAdministrator, requireUser } from "./auth";
import { database, type Queryable } from "./db";
import { assertSameOrigin, MediaServerError, readJson } from "./http";
import { enqueueArchive } from "./archive";
import { DEFAULT_LOGO_URL, insertNotifications, loadIdeas, loadNotifications, loadReference, lockIdea, nextIdeaCode, persistIdea, toAttachment } from "./repository";
import { projectIdea } from "./state";

type Operation =
  | { type: "createIdea"; input: NewIdeaInput }
  | { type: "patchIdea"; ideaId: string; patch: IdeaPatch; expectedUpdatedAt?: string }
  | { type: "submitIdea"; ideaId: string }
  | { type: "reviewIdea"; ideaId: string; decision: "approved" | "changes" | "rejected"; feedback?: string }
  | { type: "withdrawIdea"; ideaId: string }
  | { type: "cancelIdea"; ideaId: string; reason: string }
  | { type: "reopenIdea"; ideaId: string; reason: string }
  | { type: "reassignIdea"; ideaId: string; ownerId?: string; designerId?: string }
  | { type: "deleteIdea"; ideaId: string; reason?: string }
  | { type: "scheduleIdea"; ideaId: string; input: ScheduleInput; expectedSchedule?: { designerId: string; scheduledAt: string; dueDate: string; priority: string } }
  | { type: "changeDesignStatus"; ideaId: string; status: "designing" | "design_review" | "delivered" }
  | { type: "addAttachments"; ideaId: string; attachmentIds: string[] }
  | { type: "removeAttachment"; ideaId: string; attachmentId: string }
  | { type: "addQuotation"; ideaId: string; quote: Quotation }
  | { type: "removeQuotation"; ideaId: string; quotationId: string }
  | { type: "addComment"; ideaId: string; text: string }
  | { type: "markNotificationsRead"; ids?: string[] }
  | { type: "updateSettings"; patch: Partial<SystemSettings>; expected?: Partial<SystemSettings> }
  | { type: "addCompany"; name: string }
  | { type: "addCategory"; name: string }
  | { type: "updateCompany"; companyId: string; name?: string; shortName?: string; active?: boolean }
  | { type: "updateCategory"; categoryId: string; name?: string; active?: boolean; targetPerMonth?: number };

export interface OperationResult {
  idea?: Idea;
  deletedIdeaId?: string;
  companies?: MediaData["companies"];
  categories?: MediaData["categories"];
  settings?: SystemSettings;
  notifications: MediaData["notifications"];
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const IDEA_OPS = new Set(["withdrawIdea", "cancelIdea", "reopenIdea", "reassignIdea", "deleteIdea", "patchIdea", "submitIdea", "reviewIdea", "scheduleIdea", "changeDesignStatus", "addAttachments", "removeAttachment", "addQuotation", "removeQuotation", "addComment"]);

function context() {
  const now = new Date().toISOString();
  return { now, id: () => randomUUID() };
}

function parse(value: unknown): Operation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MediaServerError("طلب غير صالح.");
  const op = value as Record<string, unknown>;
  if (IDEA_OPS.has(String(op.type)) && (typeof op.ideaId !== "string" || !ID.test(op.ideaId))) throw new MediaServerError("حدد الفكرة المطلوبة.");
  if (op.type === "addAttachments" && (!Array.isArray(op.attachmentIds) || !op.attachmentIds.length || op.attachmentIds.length > 10 || op.attachmentIds.some((id) => typeof id !== "string" || !ID.test(id)))) throw new MediaServerError("اختر ملفاً واحداً على الأقل.");
  if (op.type === "markNotificationsRead" && op.ids !== undefined && (!Array.isArray(op.ids) || op.ids.length > 500 || op.ids.some((id) => typeof id !== "string"))) throw new MediaServerError("طلب غير صالح.");
  if (!["createIdea", "markNotificationsRead", "updateSettings", "addCompany", "addCategory", "updateCompany", "updateCategory", ...IDEA_OPS].includes(String(op.type))) throw new MediaServerError("إجراء غير معروف.");
  return op as unknown as Operation;
}

async function sliceWith(q: Queryable, ideas: Idea[]): Promise<MediaData> {
  return { ...(await loadReference(q)), ideas, notifications: [] };
}

async function pendingAttachments(q: Queryable, actor: TeamMember, ideaId: string, ids: string[]): Promise<Attachment[]> {
  const rows = await q.query("select id, kind::text as kind, channel::text as channel, name, size, mime, storage::text as storage, external_url, inline_mime, created_at, owner_id from wasl.attachments where id = any($1::text[]) and idea_id is null and removed_at is null and requested_idea_id = $2 for update", [ids, ideaId]);
  if (rows.rows.length !== ids.length || rows.rows.some((row) => row.owner_id !== actor.id && !isAdministrator(actor) || row.kind === "logo")) throw new MediaServerError("هذا المرفق غير صالح أو لم يتم رفعه من حسابك لهذه الفكرة. ارفع الملف مجدداً.", 422, "INVALID_ATTACHMENT");
  return ids.map((id) => toAttachment(rows.rows.find((row) => row.id === id)!));
}

async function ideaOperation(tx: Queryable, actor: TeamMember, op: Exclude<Operation, { type: "createIdea" | "markNotificationsRead" | "updateSettings" | "addCompany" | "addCategory" | "deleteIdea" | "updateCompany" | "updateCategory" }>) {
  const before = await lockIdea(tx, op.ideaId);
  if (!before) throw new MediaServerError("لم يتم العثور على الفكرة.", 404, "NOT_FOUND");
  if (op.type === "scheduleIdea" && op.expectedSchedule && (["designerId", "scheduledAt", "dueDate", "priority"] as const).some((key) => String(op.expectedSchedule![key] ?? "") !== String(before[key] ?? ""))) throw new MediaServerError("غيّر عضو آخر جدولة هذا العمل أثناء تعديلك. حمّل أحدث بيانات الجدولة ثم احفظ.", 409, "FORM_VERSION_CONFLICT");
  if ("expectedUpdatedAt" in op && op.expectedUpdatedAt !== undefined && op.expectedUpdatedAt !== before.updatedAt) throw new MediaServerError("تم تحديث الفكرة أثناء تعديلك لها. احتفظ بتعديلاتك، ثم أعد فتح النسخة الأحدث وراجعها قبل الحفظ.", 409, "FORM_VERSION_CONFLICT");
  const slice = await sliceWith(tx, [before]);
  const ctx = context();
  let next: MediaData;
  switch (op.type) {
    case "patchIdea": next = patchMediaIdea(slice, actor, op.ideaId, op.patch, ctx); break;
    case "submitIdea": next = submitMediaIdea(slice, actor, op.ideaId, ctx); break;
    case "reviewIdea": next = reviewMediaIdea(slice, actor, op.ideaId, op.decision === "approved" ? "approved" : op.decision === "rejected" ? "rejected" : "changes", typeof op.feedback === "string" ? op.feedback : "", ctx); break;
    case "withdrawIdea": next = withdrawMediaIdea(slice, actor, op.ideaId, ctx); break;
    case "cancelIdea": next = cancelMediaIdea(slice, actor, op.ideaId, typeof op.reason === "string" ? op.reason : "", ctx); break;
    case "reopenIdea": next = reopenMediaIdea(slice, actor, op.ideaId, typeof op.reason === "string" ? op.reason : "", ctx); break;
    case "reassignIdea": next = reassignMediaIdea(slice, actor, op.ideaId, { ...(typeof op.ownerId === "string" ? { ownerId: op.ownerId } : {}), ...(typeof op.designerId === "string" ? { designerId: op.designerId } : {}) }, ctx); break;
    case "scheduleIdea": next = scheduleMediaIdea(slice, actor, op.ideaId, { designerId: op.input?.designerId, scheduledAt: op.input?.scheduledAt, ...(op.input?.dueDate ? { dueDate: op.input.dueDate } : {}), ...(op.input?.priority ? { priority: op.input.priority } : {}) }, ctx); break;
    case "changeDesignStatus": next = changeMediaDesignStatus(slice, actor, op.ideaId, op.status, ctx); break;
    case "addAttachments": next = addMediaAttachments(slice, actor, op.ideaId, await pendingAttachments(tx, actor, op.ideaId, op.attachmentIds), ctx); break;
    case "removeAttachment": next = removeMediaAttachment(slice, actor, op.ideaId, op.attachmentId, ctx); break;
    case "addQuotation": {
      if (!op.quote || typeof op.quote !== "object" || typeof op.quote.id !== "string" || !ID.test(op.quote.id)) throw new MediaServerError("بيانات عرض السعر غير صالحة.");
      next = addMediaQuotation(slice, actor, op.ideaId, { id: op.quote.id, vendor: String(op.quote.vendor ?? ""), amount: Number(op.quote.amount), scope: String(op.quote.scope ?? ""), days: Number(op.quote.days), ...(op.quote.attachmentId ? { attachmentId: String(op.quote.attachmentId) } : {}), recommended: op.quote.recommended === true }, ctx);
      break;
    }
    case "removeQuotation": next = removeMediaQuotation(slice, actor, op.ideaId, op.quotationId, ctx); break;
    case "addComment": next = addMediaComment(slice, actor, op.ideaId, typeof op.text === "string" ? op.text : "", ctx); break;
  }
  if (next === slice) return before;
  validateMediaData(next);
  const after = next.ideas.find((idea) => idea.id === op.ideaId)!;
  await persistIdea(tx, before, after, actor.id);
  await insertNotifications(tx, next.notifications);
  if (op.type === "changeDesignStatus" && after.status === "delivered") await enqueueArchive(tx, after.id);
  if (op.type === "reopenIdea") await tx.query("update wasl.ideas set archive_status = 'not_started', archived_at = null, approved_by = case when status = 'draft' then null else approved_by end where id = $1", [after.id]);
  return (await loadIdeas(tx, { ids: [after.id] }))[0];
}

export async function runOperation(request: Request): Promise<OperationResult> {
  assertSameOrigin(request);
  const op = parse(await readJson(request));
  const db = database();
  return db.transaction(async (tx) => {
    const actor = await requireUser(request, tx);
    const done = async (extra: Omit<OperationResult, "notifications">): Promise<OperationResult> => ({ ...extra, notifications: await loadNotifications(tx, actor.id) });
    switch (op.type) {
      case "createIdea": {
        const ctx = context();
        const slice = await sliceWith(tx, []);
        const next = createMediaIdea(slice, actor, op.input, ctx);
        const created = next.ideas[0];
        created.code = await nextIdeaCode(tx, Number(created.requestedAt.slice(0, 4)) || new Date().getUTCFullYear());
        await persistIdea(tx, null, created, actor.id);
        return done({ idea: projectIdea(actor, created) });
      }
      case "markNotificationsRead": {
        await tx.query("update wasl.notifications set read_at = now() where recipient_id = $1 and read_at is null and ($2::text[] is null or id = any($2::text[]))", [actor.id, op.ids ?? null]);
        return done({});
      }
      case "updateSettings": {
        const reference = await loadReference(tx);
        if (op.expected && (Object.keys(op.patch || {}) as (keyof SystemSettings)[]).some((key) => op.expected?.[key] !== reference.settings[key])) throw new MediaServerError("تم تحديث هذه الإعدادات أثناء تعديلك لها. احتفظ بالقيم التي كتبتها، ثم أعد فتح الإعدادات الأحدث وراجعها قبل الحفظ.", 409, "FORM_VERSION_CONFLICT");
        const { driveFolderId: _ignored, ...patch } = op.patch || {};
        void _ignored;
        const next = updateMediaSettings({ ...reference, ideas: [], notifications: [] }, actor, patch).settings;
        let logoId: string | null = null;
        if (next.logoUrl && next.logoUrl !== DEFAULT_LOGO_URL) {
          logoId = /^\/api\/files\/([a-f0-9-]{36})\?inline=1$/.exec(next.logoUrl)?.[1] || null;
          const logo = logoId ? (await tx.query("select 1 from wasl.attachments where id = $1 and kind = 'logo' and removed_at is null and inline_mime like 'image/%'", [logoId])).rows[0] : null;
          if (!logo) throw new MediaServerError("اختر شعاراً تم رفعه من إدارة النظام. ارفع الصورة مجدداً ثم احفظ الإعدادات.", 422, "INVALID_LOGO");
        }
        await tx.query("insert into wasl.settings (id, department_name, organization_name, logo_attachment_id, updated_at) values (true, $1, $2, $3, now()) on conflict (id) do update set department_name = excluded.department_name, organization_name = excluded.organization_name, logo_attachment_id = excluded.logo_attachment_id, updated_at = now()", [next.departmentName, next.organizationName, logoId]);
        return done({ settings: (await loadReference(tx)).settings });
      }
      case "addCompany": {
        const reference = await loadReference(tx);
        const next = addMediaCompany({ ...reference, ideas: [], notifications: [] }, actor, String(op.name ?? ""), context());
        const company = next.companies.at(-1)!;
        await tx.query("insert into wasl.companies (id, name, short_name, initials, color, sort_order) values ($1, $2, $3, $4, $5, $6)", [company.id, company.name, company.shortName, company.initials, company.color, next.companies.length]);
        return done({ companies: (await loadReference(tx)).companies });
      }
      case "addCategory": {
        const reference = await loadReference(tx);
        const next = addMediaCategory({ ...reference, ideas: [], notifications: [] }, actor, String(op.name ?? ""), context());
        const category = next.categories.at(-1)!;
        await tx.query("insert into wasl.categories (id, name, color, target_per_month) values ($1, $2, $3, $4)", [category.id, category.name, category.color, category.targetPerMonth]);
        return done({ categories: (await loadReference(tx)).categories });
      }
      case "updateCompany": {
        const reference = await loadReference(tx);
        const next = updateMediaCompany({ ...reference, ideas: [], notifications: [] }, actor, String(op.companyId), { ...(typeof op.name === "string" ? { name: op.name } : {}), ...(typeof op.shortName === "string" ? { shortName: op.shortName } : {}), ...(typeof op.active === "boolean" ? { active: op.active } : {}) });
        const company = next.companies.find((item) => item.id === op.companyId)!;
        await tx.query("update wasl.companies set name = $2, short_name = $3, initials = $4, active = $5 where id = $1", [company.id, company.name, company.shortName, company.initials, company.active !== false]);
        return done({ companies: (await loadReference(tx)).companies });
      }
      case "updateCategory": {
        const reference = await loadReference(tx);
        const next = updateMediaCategory({ ...reference, ideas: [], notifications: [] }, actor, String(op.categoryId), { ...(typeof op.name === "string" ? { name: op.name } : {}), ...(typeof op.active === "boolean" ? { active: op.active } : {}), ...(typeof op.targetPerMonth === "number" ? { targetPerMonth: op.targetPerMonth } : {}) });
        const category = next.categories.find((item) => item.id === op.categoryId)!;
        await tx.query("update wasl.categories set name = $2, active = $3, target_per_month = $4 where id = $1", [category.id, category.name, category.active !== false, category.targetPerMonth]);
        return done({ categories: (await loadReference(tx)).categories });
      }
      case "deleteIdea": {
        const idea = await lockIdea(tx, op.ideaId);
        if (!idea) throw new MediaServerError("لم يتم العثور على الفكرة.", 404, "NOT_FOUND");
        if (!canDeleteIdea(idea, actor)) throw new MediaServerError("حذف الفكرة متاح لمدير النظام، ولصاحبها قبل اعتمادها فقط.", 403, "FORBIDDEN");
        await tx.query("insert into wasl.deleted_ideas (id, code, title, deleted_by, reason, snapshot) values ($1, $2, $3, $4, $5, $6::jsonb) on conflict (id) do nothing", [idea.id, idea.code, idea.title, actor.id, String(op.reason || "").slice(0, 4000), JSON.stringify(idea)]);
        await tx.query("update wasl.quotations set attachment_id = null where idea_id = $1", [idea.id]);
        await tx.query("delete from wasl.ideas where id = $1", [idea.id]);
        return done({ deletedIdeaId: idea.id });
      }
      default: {
        const idea = await ideaOperation(tx, actor, op);
        return done({ idea: projectIdea(actor, idea) });
      }
    }
  });
}
