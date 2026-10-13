import {
  CHANNEL_LABELS, PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS, WORK_TYPE_LABELS,
  type Attachment, type Company, type ContentCategory, type HistoryAction, type Idea,
  type IdeaPatch, type IdeaStatus, type MediaData, type MediaNotification, type NewIdeaInput,
  type MemberPatch, type NewMemberInput, type Quotation, type ScheduleInput, type SystemSettings, type TeamMember,
} from "../data/media";

export class WorkflowError extends Error {
  constructor(message: string, public code = "WORKFLOW_INVALID", public status = 400) { super(message); this.name = "WorkflowError"; }
}
interface WorkflowContext { now?: string; id?: () => string }
const id = (ctx?: WorkflowContext) => ctx?.id?.() ?? crypto.randomUUID();
const now = (ctx?: WorkflowContext) => ctx?.now ?? new Date().toISOString();
const editableStatuses: IdeaStatus[] = ["draft", "quotations", "changes"];
const designStatuses: IdeaStatus[] = ["approved", "scheduled", "designing", "design_review"];
const patchKeys = ["title", "companyId", "companyIds", "allCompanies", "department", "categoryId", "workType", "description", "content", "executionPlan", "channels", "ownerId", "requestedAt", "dueDate", "priority", "needsQuotes"] as const;

export function riyadhToday(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function formatMediaDate(value?: string): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory", day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
export function monthLabel(value: string): string { return new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(new Date(`${value}-01T12:00:00Z`)); }
export function isAdministrator(actor: Pick<TeamMember, "role"> | null | undefined): boolean { return actor?.role === "admin" || actor?.role === "superadmin"; }
export function canEditIdea(idea: Idea, actor: TeamMember | null): boolean { return !!actor?.active && !idea.deletedAt && (isAdministrator(actor) || (editableStatuses.includes(idea.status) && actor.role === "content" && idea.ownerId === actor.id)); }
export function canDesignIdea(idea: Idea, actor: TeamMember | null): boolean { return !!actor?.active && !idea.deletedAt && designStatuses.includes(idea.status) && (isAdministrator(actor) || (actor.role === "designer" && (!idea.designerId || idea.designerId === actor.id))); }
export function missingDeliveryChannels(idea: Idea) { return idea.channels.filter((channel) => !idea.attachments.some((file) => file.kind === "final" && file.channel === channel)); }
function requireActor(data: MediaData, actor: TeamMember) {
  const real = data.members.find((member) => member.id === actor.id && member.active);
  if (!real || real.role !== actor.role) throw new WorkflowError("لا تملك صلاحية تنفيذ هذا الإجراء.", "FORBIDDEN", 403);
}
function requireRole(data: MediaData, actor: TeamMember, roles: TeamMember["role"][]) {
  requireActor(data, actor); if (!roles.includes(actor.role) && !(actor.role === "superadmin" && roles.includes("admin"))) throw new WorkflowError("هذا الإجراء غير متاح لصلاحيات حسابك.", "FORBIDDEN", 403);
}
function findIdea(data: MediaData, ideaId: string, includeDeleted = false): Idea {
  const idea = data.ideas.find((item) => item.id === ideaId && (includeDeleted || !item.deletedAt));
  if (!idea) throw new WorkflowError("لم يتم العثور على الفكرة.", "NOT_FOUND", 404);
  return idea;
}
function assertEditable(data: MediaData, actor: TeamMember, idea: Idea) { requireActor(data, actor); if (!canEditIdea(idea, actor)) throw new WorkflowError("يمكن لصاحب الفكرة تعديل المسودة أو الفكرة المعادة للتعديل فقط.", "FORBIDDEN", 403); }
function assertDesign(data: MediaData, actor: TeamMember, idea: Idea) { requireActor(data, actor); if (!canDesignIdea(idea, actor)) throw new WorkflowError("هذه المهمة غير متاحة لك للتصميم.", "FORBIDDEN", 403); }
function approvalReady(idea: Idea) {
  if (![idea.title, idea.description, idea.content, idea.executionPlan, idea.department, idea.companyId, idea.categoryId, idea.ownerId, idea.requestedAt, idea.dueDate].every((value) => value.trim())) throw new WorkflowError("أكمل العنوان والجهة والإدارة والتصنيف والوصف والنص وخطة التنفيذ والتواريخ قبل إرسال الفكرة.", "INCOMPLETE_BRIEF");
  if (!idea.channels.length) throw new WorkflowError("حدد قناة نشر واحدة على الأقل.", "NO_CHANNELS");
  if (idea.needsQuotes && (!idea.quotations.length || idea.quotations.some((quote) => !quote.attachmentId || !idea.attachments.some((file) => file.id === quote.attachmentId && file.kind === "quotation")))) throw new WorkflowError("أرفق ملف عرض السعر لكل مورد قبل الإرسال للاعتماد.", "MISSING_QUOTATIONS");
}
interface NotificationSpec { recipients: string[]; type: MediaNotification["type"]; title: string; body: string }
function ideaNotices(data: MediaData, actor: TeamMember, previous: Idea | null, next: Idea, action: HistoryAction, note: string, at: string, ctx?: WorkflowContext, specification?: NotificationSpec): MediaNotification[] {
  const managers = data.members.filter((member) => member.active && member.role === "manager").map((member) => member.id);
  const recipients = new Set([...managers, ...(specification?.recipients || []), ...(previous?.ownerId !== next.ownerId ? [next.ownerId] : []), ...(next.designerId && previous?.designerId !== next.designerId ? [next.designerId] : [])]);
  const detail = action === "edited" && previous?.status === "changes" ? "نفّذ التعديلات المطلوبة وفق ملاحظات المدير" : action === "submitted" && previous?.managerFeedback ? "أعاد إرسال الفكرة بعد معالجة ملاحظات المدير" : note;
  return [...recipients].filter((recipientId) => data.members.some((member) => member.id === recipientId && member.active)).map((recipientId) => {
    const assigned = previous?.ownerId !== next.ownerId && recipientId === next.ownerId || !!next.designerId && previous?.designerId !== next.designerId && recipientId === next.designerId;
    const explicit = specification?.recipients.includes(recipientId);
    const achievement = action === "delivered";
    return { id: id(ctx), recipientId, ideaId: next.id, actorId: actor.id, actorName: actor.name, entityType: "idea" as const, entityId: next.id, action, type: achievement ? "achievement" as const : assigned ? "assignment" as const : explicit ? specification!.type : "activity" as const,
      title: achievement ? "إنجاز جديد للفريق · شكراً لإبداعك" : assigned ? "أُسند إليك عمل جديد" : explicit ? specification!.title : "نشاط جديد على الفكرة",
      body: `${actor.name} · ${detail} · ${next.title}${achievement ? " · اكتملت نسخ النشر المطلوبة، عمل رائع!" : ""}`, createdAt: at, read: false };
  });
}
function commitIdea(data: MediaData, actor: TeamMember, previous: Idea, next: Idea, action: HistoryAction, note: string, ctx?: WorkflowContext, notification?: NotificationSpec): MediaData {
  const at = now(ctx);
  const event = { id: id(ctx), at, actorId: actor.id, action, note, ...(previous.status !== next.status ? { from: previous.status, to: next.status } : {}) };
  return { ...data, ideas: data.ideas.map((idea) => idea.id === previous.id ? { ...next, updatedAt: at, history: [...previous.history, event] } : idea), notifications: [...ideaNotices(data, actor, previous, next, action, note, at, ctx, notification), ...data.notifications] };
}

function normalizeCompanies<T extends Partial<Pick<Idea, "companyId" | "companyIds" | "allCompanies">>>(data: MediaData, input: T, current?: Idea): T {
  if (input.companyId === undefined && input.companyIds === undefined && input.allCompanies === undefined) return input;
  const allCompanies = input.allCompanies ?? current?.allCompanies ?? false;
  if (typeof allCompanies !== "boolean") throw new WorkflowError("اختيار الشركات غير صالح.");
  const requested = input.companyIds ?? (input.companyId !== undefined ? [input.companyId] : current ? [current.companyId, ...(current.companyIds || [])] : []);
  if (!Array.isArray(requested) || requested.some((value) => typeof value !== "string")) throw new WorkflowError("اختيار الشركات غير صالح.");
  const primary = input.companyId ?? requested[0] ?? current?.companyId;
  const selected = [...new Set([primary, ...requested].filter(Boolean) as string[])];
  const allowed = (companyId: string) => data.companies.some((company) => company.id === companyId && (company.active !== false || companyId === current?.companyId || current?.companyIds?.includes(companyId)));
  if (allCompanies) {
    const fallback = selected.find(allowed) || data.companies.find((company) => company.active !== false)?.id;
    if (!fallback) throw new WorkflowError("لا توجد شركة فعالة لربط الفكرة بها.");
    return { ...input, companyId: fallback, companyIds: [], allCompanies: true };
  }
  if (!selected.length) throw new WorkflowError("اختر شركة واحدة على الأقل أو كل الشركات.");
  if (selected.length > 50 || selected.some((companyId) => !allowed(companyId))) throw new WorkflowError("إحدى الشركات المختارة غير متاحة.");
  return { ...input, companyId: selected[0], companyIds: selected.length > 1 ? selected : [], allCompanies: false };
}

export function createMediaIdea(data: MediaData, actor: TeamMember, raw: NewIdeaInput, ctx?: WorkflowContext): MediaData {
  requireRole(data, actor, ["admin", "content"]);
  const input = normalizeCompanies(data, Object.fromEntries(patchKeys.filter((key) => raw?.[key] !== undefined || !["companyIds", "allCompanies"].includes(key)).map((key) => [key, raw?.[key]])) as NewIdeaInput);
  if (typeof input.title !== "string" || typeof input.requestedAt !== "string" || typeof input.ownerId !== "string") throw new WorkflowError("بيانات الفكرة غير مكتملة.");
  if (!isAdministrator(actor) && input.ownerId !== actor.id) throw new WorkflowError("يجب أن تكون أنت مسؤول الفكرة الجديدة.", "FORBIDDEN", 403);
  const owner = data.members.find((member) => member.id === input.ownerId && member.active);
  if (!owner || !(isAdministrator(owner) || owner.role === "content")) throw new WorkflowError("اختر مسؤولاً من فريق المحتوى والتنسيق.");
  if (!input.title.trim()) throw new WorkflowError("أدخل عنوان الفكرة.");
  const at = now(ctx), ideaId = id(ctx);
  const year = input.requestedAt.slice(0, 4) || riyadhToday().slice(0, 4);
  const maxCode = data.ideas.reduce((max, idea) => Math.max(max, Number(idea.code.split("-").at(-1)) || 0), 0);
  const idea: Idea = { ...input, id: ideaId, code: `IC-${year}-${String(maxCode + 1).padStart(3, "0")}`, status: "draft", designerId: "", scheduledAt: "", managerFeedback: "", quotations: [], attachments: [], createdAt: at, updatedAt: at, history: [{ id: id(ctx), at, actorId: actor.id, action: "created", note: "تم إنشاء الفكرة", to: "draft" }] };
  const result = { ...data, ideas: [idea, ...data.ideas], notifications: [...ideaNotices(data, actor, null, idea, "created", "أنشأ فكرة جديدة", at, ctx), ...data.notifications] }; validateMediaData(result); return result;
}
export function patchMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, patch: IdeaPatch, ctx?: WorkflowContext): MediaData {
  const idea = findIdea(data, ideaId); assertEditable(data, actor, idea);
  if (Object.keys(patch).some((key) => !patchKeys.includes(key as typeof patchKeys[number]))) throw new WorkflowError("لا يمكن تعديل بيانات الاعتماد أو الجدولة من محرر المحتوى.", "FORBIDDEN", 403);
  if (!isAdministrator(actor) && patch.ownerId && patch.ownerId !== actor.id) throw new WorkflowError("تغيير مسؤول الفكرة متاح لمدير النظام.", "FORBIDDEN", 403);
  if (patch.ownerId !== undefined && patch.ownerId !== idea.ownerId) {
    const owner = data.members.find((member) => member.id === patch.ownerId && member.active);
    if (!owner || !(isAdministrator(owner) || owner.role === "content")) throw new WorkflowError("اختر مسؤولاً فعالاً من فريق المحتوى والتنسيق.");
  }
  patch = normalizeCompanies(data, patch, idea);
  const changed = (Object.keys(patch) as (keyof IdeaPatch)[]).filter((key) => JSON.stringify(patch[key] ?? (key === "companyIds" ? [] : key === "allCompanies" ? false : undefined)) !== JSON.stringify(idea[key] ?? (key === "companyIds" ? [] : key === "allCompanies" ? false : undefined)));
  if (!changed.length) return data;
  const next: Idea = { ...idea, ...patch };
  const substantive = ["title", "companyId", "companyIds", "allCompanies", "categoryId", "workType", "description", "content", "executionPlan", "channels", "needsQuotes"];
  const requiresReapproval = isAdministrator(actor) && (designStatuses.includes(idea.status) || idea.status === "delivered") && changed.some((key) => substantive.includes(key));
  if (requiresReapproval) { next.status = "review"; delete next.approvedAt; delete next.deliveredAt; }

  if (next.status === "quotations" && !next.needsQuotes && !next.quotations.length) next.status = "draft";
  const result = commitIdea(data, actor, idea, next, "edited", requiresReapproval ? "عُدّل المحتوى المعتمد وأُعيد إلى المدير للاعتماد مع حفظ ملفات التنفيذ" : idea.status === "changes" ? "تم تنفيذ التعديلات المطلوبة وفق ملاحظات المدير" : "تم تحديث تفاصيل الفكرة", ctx, requiresReapproval ? { recipients: data.members.filter((member) => member.role === "manager").map((member) => member.id), type: "approval", title: "تعديل محتوى معتمد يحتاج مراجعتك", body: idea.title } : undefined); validateMediaData(result); return result;
}
export function submitMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, ctx?: WorkflowContext): MediaData {
  const idea = findIdea(data, ideaId); assertEditable(data, actor, idea); approvalReady(idea);
  return commitIdea(data, actor, idea, { ...idea, status: "review" }, "submitted", "تم إرسال الفكرة للمراجعة والاعتماد", ctx, { recipients: data.members.filter((member) => (member.role === "manager" || isAdministrator(member)) && member.id !== actor.id).map((member) => member.id), type: "approval", title: "فكرة بانتظار اعتمادك", body: idea.title });
}
export function reviewMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, decision: "approved" | "changes" | "rejected", feedback = "", ctx?: WorkflowContext): MediaData {
  ctx = { ...ctx, now: now(ctx) };
  requireRole(data, actor, ["admin", "manager"]); const idea = findIdea(data, ideaId);
  if (idea.status !== "review") throw new WorkflowError("يمكن اعتماد الأفكار الموجودة في انتظار المراجعة فقط.", "INVALID_TRANSITION");
  if (idea.ownerId === actor.id) throw new WorkflowError("لا يعتمد صاحب الفكرة فكرته. يعتمدها مدير آخر.", "SELF_APPROVAL", 403);
  if (decision !== "approved" && !feedback.trim()) throw new WorkflowError(decision === "rejected" ? "اكتب سبب رفض الفكرة ليصل إلى صاحبها." : "أضف ملاحظات واضحة للفريق قبل إعادة الفكرة للتعديل.", "FEEDBACK_REQUIRED");
  if (decision === "rejected") return commitIdea(data, actor, idea, { ...idea, status: "rejected", managerFeedback: feedback.trim() }, "rejected", feedback.trim(), ctx, { recipients: [idea.ownerId], type: "feedback", title: "رُفضت الفكرة", body: `${idea.title} · ${feedback.trim()}` });
  if (decision === "approved") approvalReady(idea);
  const next: Idea = { ...idea, status: decision, managerFeedback: feedback.trim(), ...(decision === "approved" ? { approvedAt: now(ctx) } : {}) };
  return commitIdea(data, actor, idea, next, decision === "approved" ? "approved" : "changes_requested", decision === "approved" ? "تم اعتماد الفكرة وإحالتها تلقائياً إلى فريق التصميم" : feedback.trim(), ctx, { recipients: decision === "approved" ? [idea.ownerId, ...data.members.filter((member) => member.role === "designer").map((member) => member.id)] : [idea.ownerId], type: decision === "approved" ? "assignment" : "feedback", title: decision === "approved" ? "فكرة معتمدة جاهزة للجدولة" : "الفكرة تحتاج تعديلاً", body: decision === "approved" ? idea.title : `${idea.title} · ${feedback.trim()}` });
}
export function scheduleMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, input: ScheduleInput, ctx?: WorkflowContext): MediaData {
  const idea = findIdea(data, ideaId); assertDesign(data, actor, idea);
  if (!["approved", "scheduled"].includes(idea.status)) throw new WorkflowError("يمكن جدولة الفكرة المعتمدة قبل بدء التصميم.", "INVALID_TRANSITION");
  const designer = data.members.find((member) => member.id === input.designerId && member.active && member.role === "designer");
  if (!designer) throw new WorkflowError("اختر مصمماً فعالاً وتاريخ بدء التنفيذ.");
  if (!isAdministrator(actor) && designer.id !== actor.id) throw new WorkflowError("يمكنك جدولة مهامك الخاصة فقط.", "FORBIDDEN", 403);
  if (!validDate(input.scheduledAt)) throw new WorkflowError("حدد تاريخاً صحيحاً لبدء التصميم.");
  const next = { ...idea, ...input, dueDate: input.dueDate ?? idea.dueDate, priority: input.priority ?? idea.priority, status: "scheduled" as const };
  if (next.dueDate < input.scheduledAt) throw new WorkflowError("موعد التسليم يجب أن يوافق موعد بدء التنفيذ أو يليه.");
  return commitIdea(data, actor, idea, next, "scheduled", "تمت جدولة التنفيذ وإسناد المهمة", ctx, { recipients: [designer.id, idea.ownerId], type: "assignment", title: "تمت جدولة التصميم", body: idea.title });
}
export function changeMediaDesignStatus(data: MediaData, actor: TeamMember, ideaId: string, status: "designing" | "design_review" | "delivered", ctx?: WorkflowContext): MediaData {
  ctx = { ...ctx, now: now(ctx) };
  const idea = findIdea(data, ideaId); assertDesign(data, actor, idea);
  const permitted: Record<string, string[]> = { scheduled: ["designing"], designing: ["design_review"], design_review: ["designing", "delivered"] };
  if (!permitted[idea.status]?.includes(status)) throw new WorkflowError("أكمل مراحل التنفيذ بالترتيب: الجدولة، التصميم، مراجعة التصميم، التسليم.", "INVALID_TRANSITION");
  if (status === "delivered" && missingDeliveryChannels(idea).length) throw new WorkflowError(`أرفق النسخة النهائية لكل قناة: ${missingDeliveryChannels(idea).map((channel) => CHANNEL_LABELS[channel]).join("، ")}.`, "MISSING_DELIVERABLES");
  const action: HistoryAction = status === "designing" ? "design_started" : status === "design_review" ? "design_review" : "delivered";
  const next = { ...idea, status, ...(status === "delivered" ? { deliveredAt: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now(ctx))) } : {}) };
  return commitIdea(data, actor, idea, next, action, `تم تغيير حالة التصميم إلى ${STATUS_LABELS[status]}`, ctx, { recipients: status === "delivered" ? [idea.ownerId, idea.designerId, actor.id, ...data.members.filter((member) => member.role === "manager").map((member) => member.id)] : [idea.ownerId], type: status === "delivered" ? "delivery" : "assignment", title: status === "delivered" ? "تم تسليم العمل" : "تحديث حالة التصميم", body: idea.title });
}
export function addMediaAttachments(data: MediaData, actor: TeamMember, ideaId: string, attachments: Attachment[], ctx?: WorkflowContext): MediaData {
  const idea = findIdea(data, ideaId);
  requireActor(data, actor);
  if (!attachments.length) throw new WorkflowError("اختر ملفاً واحداً على الأقل.");
  if (attachments.some((file) => file.kind === "final") && !isAdministrator(actor)) { assertDesign(data, actor, idea); if (idea.status === "approved") throw new WorkflowError("جدول الفكرة قبل إرفاق التصميم النهائي."); }
  if (attachments.some((file) => file.kind !== "final")) assertEditable(data, actor, idea);
  if (attachments.some((file) => file.kind === "final" && (!file.channel || !idea.channels.includes(file.channel)))) throw new WorkflowError("حدد قناة مطلوبة لكل مخرج نهائي.");
  if (attachments.some((file) => idea.attachments.some((existing) => existing.id === file.id))) throw new WorkflowError("هذا الملف مرفق بالفعل.");
  const result = commitIdea(data, actor, idea, { ...idea, attachments: [...idea.attachments, ...attachments] }, "attachments_added", `تم إرفاق ${attachments.length} ملف`, ctx); validateMediaData(result); return result;
}
export function removeMediaAttachment(data: MediaData, actor: TeamMember, ideaId: string, attachmentId: string, ctx?: WorkflowContext): MediaData {
  const idea = findIdea(data, ideaId), file = idea.attachments.find((item) => item.id === attachmentId);
  if (!file) throw new WorkflowError("المرفق غير موجود.");
  if (isAdministrator(actor)) requireActor(data, actor); else if (file.kind === "final") assertDesign(data, actor, idea); else assertEditable(data, actor, idea);
  if (idea.quotations.some((quote) => quote.attachmentId === attachmentId)) throw new WorkflowError("احذف عرض السعر المرتبط أولاً قبل إزالة المرفق.");
  const next: Idea = { ...idea, attachments: idea.attachments.filter((item) => item.id !== attachmentId) };
  const requiresDelivery = idea.status === "delivered" && file.kind === "final" && missingDeliveryChannels(next).length > 0;
  if (requiresDelivery) { next.status = "design_review"; delete next.deliveredAt; }
  return commitIdea(data, actor, idea, next, "attachment_removed", requiresDelivery ? `حُذف المخرج النهائي ${file.name} وأُعيد العمل إلى مراجعة التصميم لاستكمال نسخ النشر` : file.kind === "quotation" ? "تم حذف ملف عرض سعر" : `تم حذف المرفق: ${file.name}`, ctx, requiresDelivery ? { recipients: [idea.ownerId, idea.designerId], type: "assignment", title: "العمل يحتاج استكمال نسخة النشر", body: idea.title } : undefined);
}
export function addMediaQuotation(data: MediaData, actor: TeamMember, ideaId: string, quote: Quotation, ctx?: WorkflowContext): MediaData {
  const idea = findIdea(data, ideaId); assertEditable(data, actor, idea);
  if (!quote.vendor.trim() || !quote.scope.trim() || !Number.isFinite(quote.amount) || quote.amount <= 0 || !Number.isInteger(quote.days) || quote.days < 1) throw new WorkflowError("أكمل المورد ونطاق العمل والسعر ومدة التنفيذ بصورة صحيحة.");
  if (!quote.attachmentId || !idea.attachments.some((file) => file.id === quote.attachmentId && file.kind === "quotation")) throw new WorkflowError("أرفق ملف عرض السعر وحدده قبل إضافة المورد.", "MISSING_QUOTATIONS");
  if (idea.quotations.some((item) => item.id === quote.id)) throw new WorkflowError("عرض السعر موجود بالفعل.");
  const next: Idea = { ...idea, needsQuotes: true, status: idea.status === "draft" ? "quotations" : idea.status, quotations: [...idea.quotations.map((item) => quote.recommended ? { ...item, recommended: false } : item), quote] };
  const requiresReapproval = designStatuses.includes(idea.status) || idea.status === "delivered";
  if (requiresReapproval) { next.status = "review"; delete next.approvedAt; delete next.deliveredAt; }
  return commitIdea(data, actor, idea, next, "quotation_added", `أُضيف عرض سعر من ${quote.vendor}${requiresReapproval ? " وأُعيد العمل إلى المدير لاعتماد عرض السعر الجديد" : ""}`, ctx, { recipients: [idea.ownerId, ...(requiresReapproval ? data.members.filter((member) => member.role === "manager").map((member) => member.id) : [])], type: requiresReapproval ? "approval" : "quotation", title: requiresReapproval ? "عرض سعر جديد يحتاج اعتمادك" : "عرض سعر جديد للمراجعة", body: `${idea.title} · ${quote.vendor}` });
}
export function removeMediaQuotation(data: MediaData, actor: TeamMember, ideaId: string, quotationId: string, ctx?: WorkflowContext): MediaData {
  const idea = findIdea(data, ideaId); assertEditable(data, actor, idea);
  const quote = idea.quotations.find((item) => item.id === quotationId); if (!quote) throw new WorkflowError("عرض السعر غير موجود.");
  const next: Idea = { ...idea, quotations: idea.quotations.filter((item) => item.id !== quotationId) };
  const requiresReapproval = designStatuses.includes(idea.status) || idea.status === "delivered";
  if (requiresReapproval) { next.status = "review"; delete next.approvedAt; delete next.deliveredAt; }
  return commitIdea(data, actor, idea, next, "quotation_removed", `تم حذف عرض السعر من ${quote.vendor}${requiresReapproval ? " وأُعيد العمل إلى المدير لمراجعة عروض الأسعار" : ""}`, ctx, requiresReapproval ? { recipients: data.members.filter((member) => member.role === "manager").map((member) => member.id), type: "approval", title: "تغيير عروض الأسعار يحتاج اعتمادك", body: idea.title } : undefined);
}
const ownerStages: IdeaStatus[] = ["draft", "quotations", "review", "changes"];
const finalStatuses: IdeaStatus[] = ["delivered", "cancelled", "rejected"];
export function canWithdrawIdea(idea: Idea, actor: TeamMember | null) { return !!actor?.active && !idea.deletedAt && idea.status === "review" && (isAdministrator(actor) || idea.ownerId === actor.id); }
export function canCancelIdea(idea: Idea, actor: TeamMember | null) { return !!actor?.active && !idea.deletedAt && !finalStatuses.includes(idea.status) && (isAdministrator(actor) || (idea.ownerId === actor.id && ownerStages.includes(idea.status))); }
export function canDeleteIdea(idea: Idea, actor: TeamMember | null) { return !!actor?.active && (isAdministrator(actor) || actor.role === "manager") && !idea.deletedAt; }
export function canRestoreIdea(idea: Idea, actor: TeamMember | null) { return !!actor?.active && isAdministrator(actor) && !!idea.deletedAt; }
export function deleteMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, reason = "", ctx?: WorkflowContext): MediaData {
  requireRole(data, actor, ["admin", "manager"]); const idea = findIdea(data, ideaId, true);
  if (idea.deletedAt) return data;
  if (typeof reason !== "string" || reason.length > 4000) throw new WorkflowError("اكتب سبباً لا يتجاوز ٤٠٠٠ حرف.");
  const at = now(ctx);
  return commitIdea(data, actor, idea, { ...idea, deletedAt: at, deletedBy: actor.id, deletionReason: reason.trim() }, "deleted", "نُقل العمل إلى سلة المحذوفات" + (reason.trim() ? ` · ${reason.trim()}` : ""), { ...ctx, now: at }, { recipients: [idea.ownerId, idea.designerId], type: "activity", title: "نُقل العمل إلى سلة المحذوفات", body: idea.title });
}
export function restoreMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, ctx?: WorkflowContext, assignment?: { ownerId?: string; designerId?: string }): MediaData {
  requireRole(data, actor, ["admin"]); const idea = findIdea(data, ideaId, true);
  if (!idea.deletedAt) return data;
  const restored = { ...idea };
  const notes: string[] = [];
  const assignmentError = () => { throw new WorkflowError("حدد مسؤول محتوى ومصممًا فعالين عند الاستعادة من إدارة النظام.", "RESTORE_ASSIGNMENT_REQUIRED", 422); };
  if (assignment?.ownerId !== undefined) {
    const owner = data.members.find((member) => member.id === assignment.ownerId && member.active && (isAdministrator(member) || member.role === "content"));
    if (!owner) assignmentError();
    restored.ownerId = owner!.id;
    if (owner!.id !== idea.ownerId) notes.push(`أُعيد إسناد المحتوى إلى ${owner!.name}`);
  }
  if (assignment?.designerId !== undefined) {
    const designer = data.members.find((member) => member.id === assignment.designerId && member.active && member.role === "designer");
    if (!designer) assignmentError();
    restored.designerId = designer!.id;
    if (designer!.id !== idea.designerId) notes.push(`أُعيد إسناد التصميم إلى ${designer!.name}`);
  }
  if (!["delivered", "cancelled", "rejected"].includes(restored.status)) {
    const owner = data.members.find((member) => member.id === restored.ownerId && member.active && (isAdministrator(member) || member.role === "content"));
    const designer = !restored.designerId || data.members.some((member) => member.id === restored.designerId && member.active && member.role === "designer");
    if (!owner || !designer || (["scheduled", "designing", "design_review"].includes(restored.status) && !restored.designerId)) assignmentError();
  }
  delete restored.deletedAt; delete restored.deletedBy; delete restored.deletionReason;
  return commitIdea(data, actor, idea, restored, "restored", `استُعيد العمل من سلة المحذوفات مع جميع ملفاته وتفاصيله${notes.length ? ` · ${notes.join(" · ")}` : ""}`, ctx, { recipients: [restored.ownerId, restored.designerId], type: "activity", title: "استُعيد عمل الفريق", body: idea.title });
}

export function canReopenIdea(idea: Idea, actor: TeamMember | null) { return !!actor?.active && !idea.deletedAt && isAdministrator(actor) && ["delivered", "cancelled", "rejected"].includes(idea.status); }
export function withdrawMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, ctx?: WorkflowContext): MediaData {
  requireActor(data, actor); const idea = findIdea(data, ideaId);
  if (!canWithdrawIdea(idea, actor)) throw new WorkflowError("يسحب صاحب الفكرة طلب الاعتماد فقط وهي بانتظار الاعتماد.", "FORBIDDEN", 403);
  return commitIdea(data, actor, idea, { ...idea, status: idea.needsQuotes ? "quotations" : "draft" }, "withdrawn", "سُحبت الفكرة من الاعتماد لتعديلها", ctx);
}
export function cancelMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, reason: string, ctx?: WorkflowContext): MediaData {
  requireActor(data, actor); const idea = findIdea(data, ideaId);
  if (!canCancelIdea(idea, actor)) throw new WorkflowError("إلغاء الفكرة متاح لصاحبها قبل اعتمادها، ولمدير النظام قبل التسليم.", "FORBIDDEN", 403);
  if (!reason.trim() || reason.length > 4000) throw new WorkflowError("اكتب سبب الإلغاء.", "REASON_REQUIRED");
  return commitIdea(data, actor, idea, { ...idea, status: "cancelled" }, "cancelled", reason.trim(), ctx, { recipients: [idea.ownerId, idea.designerId].filter((memberId) => memberId && memberId !== actor.id), type: "feedback", title: "أُلغيت الفكرة", body: `${idea.title}: ${reason.trim()}` });
}
export function reopenMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, reason: string, ctx?: WorkflowContext): MediaData {
  requireActor(data, actor); const idea = findIdea(data, ideaId);
  if (!canReopenIdea(idea, actor)) throw new WorkflowError("إعادة فتح الأعمال متاحة لمدير النظام فقط.", "FORBIDDEN", 403);
  if (!reason.trim() || reason.length > 4000) throw new WorkflowError("اكتب سبب إعادة الفتح.", "REASON_REQUIRED");
  const target: IdeaStatus = idea.status === "delivered" ? "designing" : "draft";
  const next: Idea = { ...idea, status: target, ...(target === "designing" ? {} : { approvedAt: undefined }) };
  if (target === "designing") delete next.deliveredAt;
  if (next.approvedAt === undefined) delete next.approvedAt;
  return commitIdea(data, actor, idea, next, "reopened", reason.trim(), ctx, { recipients: [idea.ownerId, idea.designerId].filter((memberId) => memberId && memberId !== actor.id), type: "assignment", title: "أُعيد فتح العمل", body: `${idea.title}: ${reason.trim()}` });
}
export function reassignMediaIdea(data: MediaData, actor: TeamMember, ideaId: string, input: { ownerId?: string; designerId?: string }, ctx?: WorkflowContext): MediaData {
  requireRole(data, actor, ["admin"]); const idea = findIdea(data, ideaId);
  const next: Idea = { ...idea };
  const notes: string[] = [];
  if (input.ownerId !== undefined && input.ownerId !== idea.ownerId) {
    const owner = data.members.find((member) => member.id === input.ownerId && member.active);
    if (!owner || !(isAdministrator(owner) || owner.role === "content")) throw new WorkflowError("اختر مسؤولاً فعالاً من فريق المحتوى والتنسيق.");
    next.ownerId = owner.id; notes.push(`المسؤول: ${owner.name}`);
  }
  if (input.designerId !== undefined && input.designerId !== idea.designerId) {
    if (!designStatuses.includes(idea.status) && idea.status !== "delivered") throw new WorkflowError("يُسند المصمم بعد اعتماد الفكرة.", "INVALID_TRANSITION");
    const designer = data.members.find((member) => member.id === input.designerId && member.active && member.role === "designer");
    if (!designer) throw new WorkflowError("اختر مصمماً فعالاً.");
    next.designerId = designer.id; notes.push(`المصمم: ${designer.name}`);
  }
  if (!notes.length) return data;
  return commitIdea(data, actor, idea, next, "reassigned", `أُعيد الإسناد · ${notes.join(" · ")}`, ctx, { recipients: [next.ownerId, next.designerId].filter((memberId) => memberId && memberId !== actor.id), type: "assignment", title: "أُسند إليك عمل", body: idea.title });
}
export function addMediaComment(data: MediaData, actor: TeamMember, ideaId: string, text: string, ctx?: WorkflowContext): MediaData {
  requireActor(data, actor); const idea = findIdea(data, ideaId);
  if (!isAdministrator(actor) && actor.role !== "manager" && actor.id !== idea.ownerId && actor.id !== idea.designerId) throw new WorkflowError("التعليق متاح للأعضاء المعنيين بهذه الفكرة.", "FORBIDDEN", 403);
  if (!text.trim() || text.length > 4000) throw new WorkflowError("أدخل تعليقاً واضحاً لا يتجاوز ٤٠٠٠ حرف.");
  return commitIdea(data, actor, idea, idea, "comment", text.trim(), ctx, { recipients: [idea.ownerId, idea.designerId].filter((memberId) => memberId && memberId !== actor.id), type: "comment", title: "تعليق جديد على الفكرة", body: `${actor.name}: ${text.trim()}` });
}
export function updateMediaSettings(data: MediaData, actor: TeamMember, patch: Partial<SystemSettings>): MediaData {
  requireRole(data, actor, ["admin"]); const result = { ...data, settings: { ...data.settings, ...patch } }; validateMediaData(result); return result;
}
export function addMediaCompany(data: MediaData, actor: TeamMember, name: string, ctx?: WorkflowContext): MediaData {
  requireRole(data, actor, ["admin"]); if (!name.trim() || data.companies.some((item) => item.name === name.trim())) throw new WorkflowError("أدخل اسم شركة جديداً.");
  const item: Company = { id: id(ctx), name: name.trim(), shortName: name.trim(), initials: name.trim().slice(0, 1), color: "#749590" }; return { ...data, companies: [...data.companies, item] };
}
export function addMediaCategory(data: MediaData, actor: TeamMember, name: string, ctx?: WorkflowContext): MediaData {
  requireRole(data, actor, ["admin"]); if (!name.trim() || data.categories.some((item) => item.name === name.trim())) throw new WorkflowError("أدخل تصنيفاً جديداً.");
  const item: ContentCategory = { id: id(ctx), name: name.trim(), color: "#9A81B9", targetPerMonth: 4 }; return { ...data, categories: [...data.categories, item] };
}

export function updateMediaCompany(data: MediaData, actor: TeamMember, companyId: string, patch: { name?: string; shortName?: string; active?: boolean }): MediaData {
  requireRole(data, actor, ["admin"]);
  const company = data.companies.find((item) => item.id === companyId);
  if (!company) throw new WorkflowError("الشركة غير موجودة.", "NOT_FOUND", 404);
  const name = patch.name !== undefined ? patch.name.trim() : company.name;
  const shortName = patch.shortName !== undefined ? patch.shortName.trim() : company.shortName;
  if (!name || !shortName || name.length > 150 || shortName.length > 60) throw new WorkflowError("أدخل اسم الشركة واسمها المختصر.");
  if (data.companies.some((item) => item.id !== companyId && item.name === name)) throw new WorkflowError("يوجد شركة بالاسم نفسه.");
  if (patch.active === false && data.companies.filter((item) => item.active !== false && item.id !== companyId).length === 0) throw new WorkflowError("يجب إبقاء شركة واحدة متاحة على الأقل.");
  const updated: Company = { ...company, name, shortName, initials: shortName.slice(0, 1), ...(patch.active !== undefined ? { active: patch.active } : {}) };
  return { ...data, companies: data.companies.map((item) => (item.id === companyId ? updated : item)) };
}
export function updateMediaCategory(data: MediaData, actor: TeamMember, categoryId: string, patch: { name?: string; active?: boolean; targetPerMonth?: number }): MediaData {
  requireRole(data, actor, ["admin"]);
  const category = data.categories.find((item) => item.id === categoryId);
  if (!category) throw new WorkflowError("التصنيف غير موجود.", "NOT_FOUND", 404);
  const name = patch.name !== undefined ? patch.name.trim() : category.name;
  if (!name || name.length > 100) throw new WorkflowError("أدخل اسم التصنيف.");
  if (data.categories.some((item) => item.id !== categoryId && item.name === name)) throw new WorkflowError("يوجد تصنيف بالاسم نفسه.");
  if (patch.targetPerMonth !== undefined && (!Number.isInteger(patch.targetPerMonth) || patch.targetPerMonth < 0 || patch.targetPerMonth > 1000)) throw new WorkflowError("الهدف الشهري رقم صحيح بين 0 و1000.");
  if (patch.active === false && data.categories.filter((item) => item.active !== false && item.id !== categoryId).length === 0) throw new WorkflowError("يجب إبقاء تصنيف واحد متاح على الأقل.");
  const updated: ContentCategory = { ...category, name, ...(patch.targetPerMonth !== undefined ? { targetPerMonth: patch.targetPerMonth } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) };
  return { ...data, categories: data.categories.map((item) => (item.id === categoryId ? updated : item)) };
}

export function addMediaMember(data: MediaData, actor: TeamMember, input: NewMemberInput, ctx?: WorkflowContext): MediaData {
  requireRole(data, actor, ["admin"]);
  if (!["admin", "content", "manager", "designer"].includes(input.role) || !input.name.trim() || !input.title.trim()) throw new WorkflowError("أكمل اسم عضو الفريق ودوره ومسماه.");
  const member: TeamMember = { id: id(ctx), name: input.name.trim(), title: input.title.trim(), role: input.role, active: true, initials: input.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join(" "), color: "#8298AD" };
  const result = { ...data, members: [...data.members, member] }; validateMediaData(result); return result;
}
export function updateMediaMember(data: MediaData, actor: TeamMember, memberId: string, patch: MemberPatch): MediaData {
  requireRole(data, actor, ["admin"]);
  const member = data.members.find((item) => item.id === memberId);
  if (!member) throw new WorkflowError("عضو الفريق غير موجود.");
  if (Object.keys(patch).some((key) => !["name", "title", "active", "role"].includes(key))) throw new WorkflowError("لا يمكن تغيير معرّف العضو أو بيانات دخوله من هذا الإجراء.", "FORBIDDEN", 403);
  if (member.id === "root" && actor.id !== "root") throw new WorkflowError("هذا الحساب محمي؛ يمكن لصاحبه فقط تعديل بياناته.", "ROOT_PROTECTED", 403);
  if (patch.role !== undefined && !["admin", "content", "manager", "designer"].includes(patch.role)) throw new WorkflowError("اختر صلاحية صحيحة لعضو الفريق.");
  if (member.id === "root" && (patch.role !== undefined || patch.active === false)) throw new WorkflowError("لا يمكن تغيير صلاحية حساب root أو تعطيله.", "ROOT_PROTECTED", 403);
  if ((patch.name !== undefined && !patch.name.trim()) || (patch.title !== undefined && !patch.title.trim())) throw new WorkflowError("اسم العضو ومسماه مطلوبان.");
  const updated = { ...member, ...patch, ...(patch.name ? { name: patch.name.trim(), initials: patch.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join(" ") } : {}), ...(patch.title ? { title: patch.title.trim() } : {}) };
  if (data.ideas.some((idea) => !idea.deletedAt && !["delivered", "cancelled", "rejected"].includes(idea.status) && ((idea.ownerId === memberId && (!updated.active || !(isAdministrator(updated) || updated.role === "content"))) || (idea.designerId === memberId && (!updated.active || updated.role !== "designer"))))) {
    throw new WorkflowError("أعد إسناد أفكار العضو ومهام التصميم المفتوحة قبل تعطيله أو تغيير صلاحيته. ستبقى أعماله المسلّمة منسوبة إليه.", "MEMBER_IN_USE", 409);
  }
  const result = { ...data, members: data.members.map((item) => item.id === memberId ? updated : item) }; validateMediaData(result); return result;
}

function hasEnumKey(value: unknown, dictionary: object): value is string { return typeof value === "string" && Object.prototype.hasOwnProperty.call(dictionary, value); }
function validDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString().slice(0, 10) === value; }
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function fail(): never { throw new WorkflowError("بنية البيانات غير صحيحة. حدّث الصفحة وحاول مرة أخرى.", "INVALID_DATA"); }
function keys(value: unknown, allowed: readonly string[], required = allowed): asserts value is Record<string, unknown> { if (!plain(value) || Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !(key in value))) fail(); }
function str(value: unknown, max = 4000): value is string { return typeof value === "string" && value.length <= max; }
function textFields(value: Record<string, unknown>, names: string[], max = 4000) { if (names.some((key) => !str(value[key], max))) fail(); }
function uniqueIds(items: unknown[]) { const seen = new Set<string>(); for (const item of items) { if (!plain(item) || !str(item.id, 100) || !item.id || seen.has(item.id)) fail(); seen.add(item.id); } }
function array(value: unknown, max: number): asserts value is unknown[] { if (!Array.isArray(value) || value.length > max) fail(); uniqueIds(value); }
function dateTime(value: unknown) { return typeof value === "string" && value.length <= 40 && Number.isFinite(new Date(value).getTime()); }
function urlAllowed(value: unknown) { return str(value, 200000) && (!value || value.startsWith("/api/files/") || value.startsWith("/assets/") || /^https:\/\//.test(value) || /^data:(image\/svg\+xml|text\/plain);/.test(value)); }

/** The API uses this before accepting any client supplied state. Unknown keys are rejected. */
export function validateMediaData(value: unknown): asserts value is MediaData {
  keys(value, ["companies", "categories", "members", "ideas", "notifications", "settings"]);
  array(value.companies, 200); array(value.categories, 200); array(value.members, 100); array(value.ideas, 10000); array(value.notifications, 30000);
  for (const company of value.companies) { keys(company, ["id", "name", "shortName", "initials", "color", "active"], ["id", "name", "shortName", "initials", "color"]); if (company.active !== undefined && typeof company.active !== "boolean") fail(); textFields(company, ["id", "name", "shortName", "initials", "color"], 200); if (!company.name) fail(); }
  for (const category of value.categories) { keys(category, ["id", "name", "color", "targetPerMonth", "active"], ["id", "name", "color", "targetPerMonth"]); if (category.active !== undefined && typeof category.active !== "boolean") fail(); textFields(category, ["id", "name", "color"], 200); if (!category.name || !Number.isInteger(category.targetPerMonth) || (category.targetPerMonth as number) < 0 || (category.targetPerMonth as number) > 1000) fail(); }
  for (const member of value.members) { keys(member, ["id", "name", "role", "title", "initials", "color", "active"]); textFields(member, ["id", "name", "role", "title", "initials", "color"], 200); if (!hasEnumKey(member.role, ROLE_LABELS) || typeof member.active !== "boolean") fail(); }
  const members = value.members as unknown as TeamMember[];
  const root = members.find((member) => member.id === "root");
  if (members.some((member) => member.role === "superadmin" && member.id !== "root") || (root && (root.role !== "superadmin" || !root.active))) throw new WorkflowError("يجب إبقاء حساب root فعالاً بصلاحياته الحالية.", "ROOT_PROTECTED");
  if (!members.some((member) => isAdministrator(member) && member.active)) throw new WorkflowError("يجب إبقاء مدير نظام واحد فعال على الأقل.", "ADMIN_REQUIRED");
  keys(value.settings, ["departmentName", "organizationName", "logoUrl", "driveFolderId"]); textFields(value.settings, ["departmentName", "organizationName", "driveFolderId"], 300); if (!value.settings.departmentName || !urlAllowed(value.settings.logoUrl) || (value.settings.driveFolderId && !/^[A-Za-z0-9_-]{10,200}$/.test(value.settings.driveFolderId as string))) fail();
  const companyIds = new Set(value.companies.map((company) => (company as Company).id)), categoryIds = new Set(value.categories.map((category) => (category as ContentCategory).id)), memberIds = new Set(members.map((member) => member.id));
  const codes = new Set<string>();
  for (const item of value.ideas) {
    keys(item, ["id", "code", "title", "companyId", "companyIds", "allCompanies", "department", "categoryId", "workType", "description", "content", "executionPlan", "channels", "ownerId", "designerId", "requestedAt", "dueDate", "scheduledAt", "deliveredAt", "approvedAt", "priority", "status", "needsQuotes", "quotations", "attachments", "managerFeedback", "history", "createdAt", "updatedAt", "sourceProposal", "archive", "partial", "deletedAt", "deletedBy", "deletionReason"], ["id", "code", "title", "companyId", "department", "categoryId", "workType", "description", "content", "executionPlan", "channels", "ownerId", "designerId", "requestedAt", "dueDate", "scheduledAt", "priority", "status", "needsQuotes", "quotations", "attachments", "managerFeedback", "history", "createdAt", "updatedAt"]);
    textFields(item, ["id", "code", "title", "companyId", "department", "categoryId", "workType", "ownerId", "designerId", "priority", "status"], 300); textFields(item, ["description", "content", "executionPlan", "managerFeedback"], 20000);
    if (item.deletedAt !== undefined && (!dateTime(item.deletedAt) || typeof item.deletedBy !== "string" || !members.some((member) => member.id === item.deletedBy) || !str(item.deletionReason, 4000))) fail();
    if (item.archive !== undefined) { keys(item.archive, ["status", "archivedAt", "folderUrl"], ["status"]); if (!["not_started", "pending", "running", "done", "failed", "needs_review"].includes(item.archive.status as string) || (item.archive.archivedAt !== undefined && !dateTime(item.archive.archivedAt)) || (item.archive.folderUrl !== undefined && !/^https:\/\/drive\.google\.com\//.test(String(item.archive.folderUrl)))) fail(); }
    if (item.sourceProposal !== undefined) {
      keys(item.sourceProposal, ["batchId", "row", "proposerName", "funding", "originalGoal", "originalConcept", "sourceApproval", "reviewNote", "contentType", "platform", "reference", "fileName"], ["batchId", "row", "proposerName", "funding", "originalGoal", "originalConcept", "sourceApproval"]);
      textFields(item.sourceProposal, ["batchId", "proposerName", "funding", "sourceApproval"], 300);
      textFields(item.sourceProposal, ["originalGoal", "originalConcept"], 20000);
      if (!item.sourceProposal.batchId || !item.sourceProposal.proposerName || !Number.isInteger(item.sourceProposal.row) || (item.sourceProposal.row as number) < 1 || (item.sourceProposal.row as number) > 10000 || (item.sourceProposal.reviewNote !== undefined && !str(item.sourceProposal.reviewNote, 4000)) || ["contentType", "platform", "fileName"].some((key) => (item.sourceProposal as Record<string, unknown>)[key] !== undefined && !str((item.sourceProposal as Record<string, unknown>)[key], 300)) || ((item.sourceProposal as Record<string, unknown>).reference !== undefined && !str((item.sourceProposal as Record<string, unknown>).reference, 4000))) fail();
    }
    if (!item.title || codes.has(item.code as string)) fail(); codes.add(item.code as string);
    if ((item.allCompanies !== undefined && typeof item.allCompanies !== "boolean") || (item.companyIds !== undefined && (!Array.isArray(item.companyIds) || item.companyIds.length > 50 || item.companyIds.some((companyId) => !companyIds.has(companyId as string))))) fail();
    if (!companyIds.has(item.companyId as string) || !categoryIds.has(item.categoryId as string) || !memberIds.has(item.ownerId as string) || (item.designerId && !memberIds.has(item.designerId as string))) fail();
    if (!item.deletedAt && !["delivered", "cancelled", "rejected"].includes(item.status as string) && (!members.some((member) => member.id === item.ownerId && (isAdministrator(member) || member.role === "content")) || (item.designerId && !members.some((member) => member.id === item.designerId && member.role === "designer")))) fail();
    if (!hasEnumKey(item.workType, WORK_TYPE_LABELS) || !hasEnumKey(item.priority, PRIORITY_LABELS) || !hasEnumKey(item.status, STATUS_LABELS) || typeof item.needsQuotes !== "boolean") fail();
    if (!Array.isArray(item.channels) || !item.channels.length || item.channels.length > 3 || new Set(item.channels).size !== item.channels.length || item.channels.some((channel) => !hasEnumKey(channel, CHANNEL_LABELS))) fail();
    if (!validDate(item.requestedAt) || !validDate(item.dueDate) || item.dueDate < item.requestedAt || (!str(item.scheduledAt, 10) || (item.scheduledAt !== "" && !validDate(item.scheduledAt))) || (item.deliveredAt !== undefined && !validDate(item.deliveredAt)) || (item.approvedAt !== undefined && !dateTime(item.approvedAt)) || !dateTime(item.createdAt) || !dateTime(item.updatedAt)) fail();
    array(item.attachments, 200); array(item.quotations, 100); array(item.history, 3000);
    for (const file of item.attachments) { keys(file, ["id", "name", "size", "mime", "url", "kind", "channel", "createdAt"], ["id", "name", "size", "mime", "url", "kind"]); textFields(file, ["id", "name", "mime", "kind"], 500); if (!file.name || !["brief", "quotation", "final"].includes(file.kind as string) || !Number.isFinite(file.size) || (file.size as number) < 0 || (file.size as number) > 2 * 1024 * 1024 * 1024 || !urlAllowed(file.url) || (file.channel !== undefined && !hasEnumKey(file.channel, CHANNEL_LABELS)) || (file.createdAt !== undefined && !dateTime(file.createdAt))) fail(); }
    for (const quote of item.quotations) { keys(quote, ["id", "vendor", "amount", "scope", "days", "attachmentId", "recommended"], ["id", "vendor", "amount", "scope", "days", "recommended"]); textFields(quote, ["id", "vendor", "scope"]); if (!quote.vendor || !quote.scope || !Number.isFinite(quote.amount) || (quote.amount as number) <= 0 || !Number.isInteger(quote.days) || (quote.days as number) < 1 || (quote.days as number) > 3650 || typeof quote.recommended !== "boolean" || (quote.attachmentId !== undefined && (!(typeof quote.attachmentId === "string") || !item.attachments.some((file) => (file as Attachment).id === quote.attachmentId && (file as Attachment).kind === "quotation")))) fail(); }
    if (item.quotations.filter((quote) => (quote as Quotation).recommended).length > 1) fail();
    const actions = ["created", "edited", "submitted", "changes_requested", "approved", "scheduled", "design_started", "design_review", "delivered", "attachments_added", "attachment_removed", "quotation_added", "quotation_removed", "comment", "withdrawn", "rejected", "cancelled", "reopened", "reassigned", "archived", "deleted", "restored"];
    for (const event of item.history) { keys(event, ["id", "at", "actorId", "action", "note", "from", "to"], ["id", "at", "actorId", "action", "note"]); textFields(event, ["id", "actorId", "action"], 100); textFields(event, ["note"], 20000); if (!memberIds.has(event.actorId as string) || !actions.includes(event.action as string) || !dateTime(event.at) || (event.from !== undefined && !hasEnumKey(event.from, STATUS_LABELS)) || (event.to !== undefined && !hasEnumKey(event.to, STATUS_LABELS))) fail(); }
  }
  uniqueIds((value.ideas as unknown as Idea[]).flatMap((idea) => idea.history));
  uniqueIds((value.ideas as unknown as Idea[]).flatMap((idea) => idea.attachments));
  uniqueIds([...(value.ideas as unknown as Idea[]).flatMap((idea) => idea.history), ...value.notifications]);
  const ideaIds = new Set(value.ideas.map((idea) => (idea as Idea).id));
  for (const notice of value.notifications) { keys(notice, ["id", "recipientId", "ideaId", "title", "body", "type", "createdAt", "read", "actorId", "actorName", "entityType", "entityId", "action"], ["id", "recipientId", "ideaId", "title", "body", "type", "createdAt", "read"]); textFields(notice, ["id", "recipientId", "ideaId", "title", "body", "type"]); if (!memberIds.has(notice.recipientId as string) || (notice.ideaId && !ideaIds.has(notice.ideaId as string)) || !["approval", "feedback", "assignment", "quotation", "delivery", "comment", "archive", "reminder", "activity", "achievement", "chat", "mention"].includes(notice.type as string) || !dateTime(notice.createdAt) || typeof notice.read !== "boolean" || (notice.actorId !== undefined && !memberIds.has(notice.actorId as string)) || ["actorName", "entityId", "action"].some((key) => notice[key] !== undefined && !str(notice[key], 300)) || (notice.entityType !== undefined && !["idea", "company", "category", "member", "settings", "chat", "workspace"].includes(notice.entityType as string))) fail(); }
}
