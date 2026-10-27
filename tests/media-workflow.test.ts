import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialMediaData, type Attachment, type MediaData, type NewIdeaInput, type TeamMember } from "../data/media";
import { decideMediaIdeaEdit, requestMediaIdeaEdit, addMediaAttachments, addMediaComment, addMediaMember, addMediaQuotation, changeMediaDesignStatus, createMediaIdea, deleteMediaIdea, restoreMediaIdea, isAdministrator, patchMediaIdea, reviewMediaIdea, scheduleMediaIdea, submitMediaIdea, updateMediaMember, validateMediaData, WorkflowError } from "../lib/media-workflow";

const actor = (data: MediaData, memberId: string): TeamMember => data.members.find((member) => member.id === memberId)!;
const input = (): NewIdeaInput => ({ title: "حملة صحة الموظفين", companyId: "mawaredcom", department: "إدارة الصحة والعافية", categoryId: "wellbeing", workType: "motion", description: "حملة توعوية بصحة الموظفين وطرق الاستفادة من الخدمات.", content: "صحتك أولاً، ونحن إلى جانبك.", executionPlan: "كتابة النص، تصميم النسخ، المراجعة ثم التسليم.", channels: ["screens", "whatsapp", "email"], ownerId: "noura", requestedAt: "2026-10-08", dueDate: "2026-10-20", priority: "high", needsQuotes: false });
const create = () => { const previous = createInitialMediaData(); const next = createMediaIdea(previous, actor(previous, "noura"), input()); validateMediaData(next); return next; };
const reject = (operation: () => unknown, code?: string) => assert.throws(operation, (error: unknown) => error instanceof WorkflowError && (!code || error.code === code));
function step(previous: MediaData, memberId: string, operation: (data: MediaData, user: TeamMember) => MediaData) { const user = actor(previous, memberId), next = operation(previous, user); validateMediaData(next); return next; }

 test("all demo records validate, and callers receive independent copies", () => {
  const first = createInitialMediaData(), second = createInitialMediaData(); validateMediaData(first);
  first.ideas[0].title = "تغيير محلي"; assert.notEqual(first.ideas[0].title, second.ideas[0].title);
 });
 test("an approval revision preserves feedback and routes approved work into design", () => {
  let data = create(); const ideaId = data.ideas[0].id;
  data = step(data, "noura", (d, a) => submitMediaIdea(d, a, ideaId)); assert.equal(data.ideas[0].status, "review");
  assert.ok(data.notifications.some((item) => item.recipientId === "manager" && item.ideaId === ideaId));
  data = step(data, "manager", (d, a) => reviewMediaIdea(d, a, ideaId, "changes", "أضف تفاصيل مواعيد التنفيذ"));
  data = step(data, "noura", (d, a) => patchMediaIdea(d, a, ideaId, { executionPlan: "التنفيذ خلال خمسة أيام ومراجعة جميع النسخ قبل التسليم." }));
  assert.equal(data.ideas[0].managerFeedback, "أضف تفاصيل مواعيد التنفيذ");
  data = step(data, "noura", (d, a) => submitMediaIdea(d, a, ideaId));
  data = step(data, "manager", (d, a) => reviewMediaIdea(d, a, ideaId, "approved"));
  assert.equal(data.ideas[0].status, "approved"); assert.ok(data.ideas[0].approvedAt);
  assert.ok(data.notifications.some((item) => item.recipientId === "faisal" && item.ideaId === ideaId));
  assert.equal(data.ideas[0].history.filter((item) => item.action === "submitted").length, 2);
 });
 test("external work requires an uploaded quotation for every supplier", () => {
  let data = create(); const ideaId = data.ideas[0].id;
  data = step(data, "noura", (d, a) => patchMediaIdea(d, a, ideaId, { needsQuotes: true }));
  reject(() => submitMediaIdea(data, actor(data, "noura"), ideaId), "MISSING_QUOTATIONS");
  reject(() => addMediaQuotation(data, actor(data, "noura"), ideaId, { id: "quote-1", vendor: "استوديو الإبداع", amount: 2400, scope: "تعليق صوتي", days: 3, recommended: true }), "MISSING_QUOTATIONS");
  const file: Attachment = { id: "quotation-attachment", name: "عرض السعر.pdf", size: 2048, mime: "application/pdf", url: "/api/files/quotation-attachment", kind: "quotation" };
  data = step(data, "noura", (d, a) => addMediaAttachments(d, a, ideaId, [file]));
  data = step(data, "noura", (d, a) => addMediaQuotation(d, a, ideaId, { id: "quote-1", vendor: "استوديو الإبداع", amount: 2400, scope: "تعليق صوتي", days: 3, attachmentId: file.id, recommended: true }));
  assert.equal(data.ideas[0].status, "quotations");
  data = step(data, "noura", (d, a) => submitMediaIdea(d, a, ideaId)); assert.equal(data.ideas[0].status, "review");
 });
 test("delivery requires a final version for every requested channel and an ordered workflow", () => {
  let data = create(); const ideaId = data.ideas[0].id;
  data = step(data, "noura", (d, a) => submitMediaIdea(d, a, ideaId));
  data = step(data, "manager", (d, a) => reviewMediaIdea(d, a, ideaId, "approved"));
  reject(() => changeMediaDesignStatus(data, actor(data, "faisal"), ideaId, "delivered"), "INVALID_TRANSITION");
  data = step(data, "faisal", (d, a) => scheduleMediaIdea(d, a, ideaId, { designerId: "faisal", scheduledAt: "2026-10-10" }));
  reject(() => scheduleMediaIdea(data, actor(data, "omar"), ideaId, { designerId: "omar", scheduledAt: "2026-10-10" }), "FORBIDDEN");
  data = step(data, "faisal", (d, a) => changeMediaDesignStatus(d, a, ideaId, "designing"));
  reject(() => changeMediaDesignStatus(data, actor(data, "faisal"), ideaId, "design_review"), "INVALID_TRANSITION");
  const files: Attachment[] = data.ideas[0].channels.map((channel) => ({ id: `final-${channel}`, name: `${channel}.mp4`, size: 3072, mime: "video/mp4", url: `/api/files/final-${channel}`, kind: "final", channel }));
  data = step(data, "faisal", (d, a) => addMediaAttachments(d, a, ideaId, files.slice(0, 2)));
  reject(() => changeMediaDesignStatus(data, actor(data, "faisal"), ideaId, "delivered"), "MISSING_DELIVERABLES");
  data = step(data, "faisal", (d, a) => addMediaAttachments(d, a, ideaId, files.slice(2)));
  data = step(data, "faisal", (d, a) => changeMediaDesignStatus(d, a, ideaId, "delivered"));
  assert.equal(data.ideas[0].status, "delivered"); assert.ok(data.ideas[0].deliveredAt);
  reject(() => patchMediaIdea(data, actor(data, "noura"), ideaId, { title: "بعد التسليم" }), "FORBIDDEN");
 });
 test("content cannot approve, edit others' work, or forge an approval alongside an edit", () => {
  const data = create(), ideaId = data.ideas[0].id;
  reject(() => reviewMediaIdea(data, actor(data, "noura"), ideaId, "approved"), "FORBIDDEN");
  reject(() => patchMediaIdea(data, actor(data, "sara"), ideaId, { title: "تعديل" }), "FORBIDDEN");
 });
 test("unknown keys, inherited enum names, malformed dates and duplicate audit IDs are rejected", () => {
  const data = create();
  const inherited = structuredClone(data); inherited.ideas[0].status = "toString" as never; reject(() => validateMediaData(inherited), "INVALID_DATA");
  const malformed = structuredClone(data); malformed.ideas[0].scheduledAt = null as never; reject(() => validateMediaData(malformed), "INVALID_DATA");
  const badDate = structuredClone(data); badDate.ideas[0].dueDate = "2026-02-30"; reject(() => validateMediaData(badDate), "INVALID_DATA");
  const extra = structuredClone(data); Object.assign(extra.ideas[0], { managerApproved: true }); reject(() => validateMediaData(extra), "INVALID_DATA");
  const duplicates = structuredClone(data); duplicates.ideas[0].history[0].id = duplicates.ideas[1].history[0].id; reject(() => validateMediaData(duplicates), "INVALID_DATA");
 });
 test("comments notify the responsible members while retaining the underlying brief", () => {
  const data = create(), next = addMediaComment(data, actor(data, "manager"), data.ideas[0].id, "يرجى تنسيق الموعد مع إدارة الصحة");
  validateMediaData(next); assert.equal(next.ideas[0].description, data.ideas[0].description);
  assert.equal(next.ideas[0].history.at(-1)?.action, "comment"); assert.ok(next.notifications.some((notice) => notice.recipientId === "noura" && notice.action === "comment"));
 });
 test("admin may create another admin and manage roster names while preserving an active administrator", () => {
  const data = createInitialMediaData(), admin = actor(data, "admin");
  const updated = updateMediaMember(data, admin, "noura", { name: "هدى السالم", title: "منسقة المحتوى" }); validateMediaData(updated);
  const added = addMediaMember(updated, admin, { name: "ليان علي", title: "مصممة", role: "designer" }); validateMediaData(added);
  reject(() => updateMediaMember(data, admin, "admin", { active: false }));
  const secondAdmin = addMediaMember(added, admin, { name: "خالد علي", title: "مدير نظام", role: "admin" }); validateMediaData(secondAdmin);
  const disabled = updateMediaMember(secondAdmin, admin, "admin", { active: false }); validateMediaData(disabled);
  assert.equal(disabled.members.find((member) => member.id === "admin")?.active, false);
  reject(() => addMediaMember(data, admin, { name: "مدير أعلى مزور", title: "مدير", role: "superadmin" as never }));
 });

function withRoot() {
  const data = createInitialMediaData();
  data.members.push({ id: "root", name: "صاحب النظام", role: "superadmin", title: "المدير الأعلى", initials: "ص ن", color: "#3D5476", active: true });
  validateMediaData(data); return data;
}

test("root has every administrator operational permission and may own imported ideas", () => {
  let data = withRoot(); const root = actor(data, "root");
  assert.ok(isAdministrator(root)); assert.equal(isAdministrator(null), false);
  data = step(data, "root", (d, a) => createMediaIdea(d, a, { ...input(), ownerId: "root" }));
  const ideaId = data.ideas[0].id;
  data = step(data, "root", (d, a) => patchMediaIdea(d, a, ideaId, { title: "اقتراح المدير الأعلى" }));
  data = step(data, "root", (d, a) => submitMediaIdea(d, a, ideaId));
  data = step(data, "manager", (d, a) => reviewMediaIdea(d, a, ideaId, "approved")); reject(() => reviewMediaIdea(data, actor(data, "root"), ideaId, "approved"), "INVALID_TRANSITION");
  data = step(data, "root", (d, a) => scheduleMediaIdea(d, a, ideaId, { designerId: "faisal", scheduledAt: "2026-10-10" }));
  data = step(data, "root", (d, a) => changeMediaDesignStatus(d, a, ideaId, "designing"));
  assert.equal(data.ideas[0].status, "designing");
});

test("root is protected against other admins, deactivation, downgrade and a second superadmin", () => {
  const data = withRoot(), root = actor(data, "root"), admin = actor(data, "admin");
  reject(() => updateMediaMember(data, admin, "root", { name: "اسم آخر" }), "ROOT_PROTECTED");
  reject(() => updateMediaMember(data, root, "root", { active: false }), "ROOT_PROTECTED");
  reject(() => updateMediaMember(data, root, "root", { role: "admin" }), "ROOT_PROTECTED");
  const renamed = updateMediaMember(data, root, "root", { name: "صاحب الفكرة", title: "مدير المجموعة" }); validateMediaData(renamed);
  const disabled = structuredClone(data); disabled.members.find((member) => member.id === "root")!.active = false; reject(() => validateMediaData(disabled), "ROOT_PROTECTED");
  const secondRoot = structuredClone(data); secondRoot.members.find((member) => member.id === "admin")!.role = "superadmin"; reject(() => validateMediaData(secondRoot), "ROOT_PROTECTED");
});

test("role changes require reassigning open work, while completed work preserves attribution by member id", () => {
  const data = withRoot(), root = actor(data, "root");
  reject(() => updateMediaMember(data, root, "noura", { role: "manager" }), "MEMBER_IN_USE");
  reject(() => updateMediaMember(data, root, "omar", { active: false }), "MEMBER_IN_USE");
  const historical = structuredClone(data); historical.ideas = historical.ideas.filter((idea) => idea.status === "delivered"); historical.notifications = [];
  const previousHistory = structuredClone(historical.ideas.map((idea) => ({ ownerId: idea.ownerId, designerId: idea.designerId, history: idea.history })));
  let changed = updateMediaMember(historical, root, "noura", { role: "manager", name: "اسمها الصحيح" }); validateMediaData(changed);
  changed = updateMediaMember(changed, root, "omar", { role: "content", active: false }); validateMediaData(changed);
  assert.deepEqual(changed.ideas.map((idea) => ({ ownerId: idea.ownerId, designerId: idea.designerId, history: idea.history })), previousHistory);
});

test("import provenance retains original attribution through edits and cannot be forged by an online mutation", () => {
  const data = create(); const ideaId = data.ideas[0].id;
  data.ideas[0].sourceProposal = { batchId: "ideas-import-2026", row: 7, proposerName: "اسم مقدم الفكرة", funding: "غير ممول", originalGoal: "رفع المشاركة", originalConcept: "لقاء تعريفي", sourceApproval: "مقترح" };
  validateMediaData(data);
  const edited = patchMediaIdea(data, actor(data, "noura"), ideaId, { title: "عنوان تنفيذي" }); validateMediaData(edited);
  assert.deepEqual(edited.ideas[0].sourceProposal, data.ideas[0].sourceProposal);
  const malformed = structuredClone(data); malformed.ideas[0].sourceProposal!.row = 0; reject(() => validateMediaData(malformed), "INVALID_DATA");
});


test("every persisted idea activity reaches active managers once with authenticated actor identity", () => {
  const before = createInitialMediaData();
  before.members.push({ id: "inactive-manager", name: "مدير سابق", role: "manager", title: "", initials: "م", color: "#555555", active: false });
  const author = actor(before, "noura");
  const next = patchMediaIdea(before, author, "idea-003", { content: "نص يستجيب لملاحظات المدير" });
  const fresh = next.notifications.slice(0, next.notifications.length - before.notifications.length);
  assert.deepEqual(fresh.map((notice) => notice.recipientId).sort(), ["admin", "manager"]);
  assert.equal(fresh[0].actorId, author.id); assert.equal(fresh[0].actorName, author.name);
  assert.equal(fresh[0].entityType, "idea"); assert.equal(fresh[0].entityId, "idea-003"); assert.equal(fresh[0].action, "edited");
  assert.match(fresh[0].body, /نفّذ التعديلات المطلوبة/);
  const unchanged = patchMediaIdea(next, author, "idea-003", { content: "نص يستجيب لملاحظات المدير" });
  assert.equal(unchanged, next);
});

test("assigning an owner or designer generates an immediate assignment notification", () => {
  const before = createInitialMediaData();
  const created = createMediaIdea(before, actor(before, "admin"), input());
  assert.ok(created.notifications.some((notice) => notice.ideaId === created.ideas[0].id && notice.recipientId === "noura" && notice.type === "assignment" && notice.action === "created"));
  const scheduled = scheduleMediaIdea(before, actor(before, "admin"), "idea-005", { designerId: "omar", scheduledAt: "2026-10-10" });
  assert.equal(scheduled.notifications.filter((notice) => notice.ideaId === "idea-005" && notice.recipientId === "omar" && notice.action === "scheduled").length, 1);
});

test("completed delivery celebrates both responsible teammates and informs the manager once", () => {
  const before = createInitialMediaData();
  const work = before.ideas.find((item) => item.id === "idea-007")!;
  work.attachments = before.ideas.find((item) => item.status === "delivered" && item.channels.length === 3)!.attachments.map((file, index) => ({ ...file, id: `celebration-file-${index}` }));
  const next = changeMediaDesignStatus(before, actor(before, "faisal"), work.id, "delivered");
  const achievements = next.notifications.filter((notice) => notice.ideaId === work.id && notice.action === "delivered");
  assert.deepEqual(achievements.map((notice) => notice.recipientId).sort(), ["admin", "faisal", "manager", "noura"]);
  assert.ok(achievements.every((notice) => notice.type === "achievement" && notice.actorId === "faisal"));
});

test("only admins delete and restore work, preserving status and every archive attachment", () => {
  const before = createInitialMediaData(); const work = before.ideas.find((item) => item.status === "delivered")!;
  reject(() => deleteMediaIdea(before, actor(before, "noura"), work.id), "FORBIDDEN");
  const removed = deleteMediaIdea(before, actor(before, "admin"), work.id, "تم استبداله");
  const deleted = removed.ideas.find((item) => item.id === work.id)!; assert.ok(deleted.deletedAt); assert.equal(deleted.deletedBy, "admin");
  assert.equal(deleted.status, work.status); assert.deepEqual(deleted.attachments, work.attachments);
  reject(() => patchMediaIdea(removed, actor(removed, "admin"), work.id, { title: "مخفي" }), "NOT_FOUND");
  reject(() => restoreMediaIdea(removed, actor(removed, "manager"), work.id), "FORBIDDEN");
  const restored = restoreMediaIdea(removed, actor(removed, "admin"), work.id);
  assert.equal(restored.ideas.find((item) => item.id === work.id)!.deletedAt, undefined);
  assert.deepEqual(restored.ideas.find((item) => item.id === work.id)!.attachments, work.attachments);
  assert.equal(restored.ideas.find((item) => item.id === work.id)!.history.at(-1)!.action, "restored");
});

test("admin metadata edits retain delivery, but approved content changes require another approval", () => {
  const before = createInitialMediaData(); const work = before.ideas.find((item) => item.status === "delivered")!;
  const admin = actor(before, "admin");
  const metadata = patchMediaIdea(before, admin, work.id, { priority: "urgent" });
  assert.equal(metadata.ideas.find((item) => item.id === work.id)!.status, "delivered");
  const revision = patchMediaIdea(metadata, admin, work.id, { content: "محتوى جديد يحتاج اعتماداً" });
  const revised = revision.ideas.find((item) => item.id === work.id)!;
  assert.equal(revised.status, "review"); assert.equal(revised.approvedAt, undefined); assert.equal(revised.deliveredAt, undefined);
  assert.deepEqual(revised.attachments, work.attachments);
  assert.ok(revision.notifications.some((notice) => notice.entityId === work.id && notice.type === "approval" && notice.recipientId === "manager"));
});


test("the acting administrator also receives a completion celebration once", () => {
  const before = createInitialMediaData(); const work = before.ideas.find((item) => item.id === "idea-007")!;
  work.attachments = before.ideas.find((item) => item.status === "delivered" && item.channels.length === 3)!.attachments.map((file, index) => ({ ...file, id: `admin-celebration-${index}` }));
  const next = changeMediaDesignStatus(before, actor(before, "admin"), work.id, "delivered");
  assert.equal(next.notifications.filter((notice) => notice.action === "delivered" && notice.recipientId === "admin" && notice.type === "achievement").length, 1);
});

test("deleted open work permits roster changes and requires explicit valid assignments on restoration", () => {
  const before = createInitialMediaData();
  const work = before.ideas.find((idea) => idea.id === "idea-007")!;
  before.ideas = [work]; before.notifications = [];
  let removed = deleteMediaIdea(before, actor(before, "admin"), work.id);
  removed = updateMediaMember(removed, actor(removed, "admin"), work.ownerId, { role: "manager" });
  removed = updateMediaMember(removed, actor(removed, "admin"), work.designerId, { active: false });
  reject(() => restoreMediaIdea(removed, actor(removed, "admin"), work.id), "RESTORE_ASSIGNMENT_REQUIRED");
  const restored = restoreMediaIdea(removed, actor(removed, "admin"), work.id, undefined, { ownerId: "sara", designerId: "omar" });
  assert.equal(restored.ideas[0].ownerId, "sara"); assert.equal(restored.ideas[0].designerId, "omar");
  assert.equal(restored.ideas[0].status, work.status); assert.deepEqual(restored.ideas[0].attachments, work.attachments);
  validateMediaData(restored);
});

test("restoring delivered work preserves inactive historical assignments unless a replacement is requested", () => {
  const before = createInitialMediaData();
  const work = before.ideas.find((idea) => idea.status === "delivered")!;
  before.ideas = [work]; before.notifications = [];
  let removed = deleteMediaIdea(before, actor(before, "admin"), work.id);
  removed = updateMediaMember(removed, actor(removed, "admin"), work.ownerId, { active: false });
  const restored = restoreMediaIdea(removed, actor(removed, "admin"), work.id);
  assert.equal(restored.ideas[0].ownerId, work.ownerId); assert.equal(restored.ideas[0].status, "delivered");
  validateMediaData(restored);
  reject(() => restoreMediaIdea(removed, actor(removed, "admin"), work.id, undefined, { ownerId: work.ownerId }), "RESTORE_ASSIGNMENT_REQUIRED");
});
 test("an idea can target several companies or all companies, and the primary company stays first", () => {
  let data = create(); const ideaId = data.ideas[0].id;
  const others = data.companies.filter((company) => company.id !== "mawaredcom" && company.active !== false).map((company) => company.id);
  data = step(data, "noura", (d, a) => patchMediaIdea(d, a, ideaId, { companyId: "mawaredcom", companyIds: ["mawaredcom", others[0], others[0]] }));
  assert.equal(data.ideas[0].companyId, "mawaredcom"); assert.deepEqual(data.ideas[0].companyIds, ["mawaredcom", others[0]]); assert.equal(data.ideas[0].allCompanies, false);
  data = step(data, "noura", (d, a) => patchMediaIdea(d, a, ideaId, { allCompanies: true }));
  assert.equal(data.ideas[0].allCompanies, true); assert.deepEqual(data.ideas[0].companyIds, []); assert.ok(data.ideas[0].companyId);
  reject(() => patchMediaIdea(data, actor(data, "noura"), ideaId, { allCompanies: false, companyIds: ["missing-company"] }));
  const created = createMediaIdea(data, actor(data, "noura"), { ...input(), companyId: others[0], companyIds: [others[0], "mawaredcom"] });
  assert.equal(created.ideas[0].companyId, others[0]); assert.deepEqual(created.ideas[0].companyIds, [others[0], "mawaredcom"]);
 });
 test("a colleague requests an edit, and only the department manager or an administrator decides it", () => {
  let data = create(); const ideaId = data.ideas[0].id;
  data = step(data, "noura", (d, a) => submitMediaIdea(d, a, ideaId));
  const colleague = data.members.find((member) => member.active && member.id !== "noura" && member.role !== "manager" && !isAdministrator(member))!;
  reject(() => requestMediaIdeaEdit(data, actor(data, "noura"), ideaId, "own", "ملاحظة على فكرتي"), "OWN_IDEA");
  data = step(data, colleague.id, (d, a) => requestMediaIdeaEdit(d, a, ideaId, "edit-1", "أضف رقم التواصل في نهاية الرسالة"));
  assert.equal(data.ideas[0].editRequests?.[0].status, "pending");
  assert.ok(data.notifications.some((item) => item.recipientId === "manager" && item.type === "approval" && item.ideaId === ideaId));
  reject(() => requestMediaIdeaEdit(data, actor(data, colleague.id), ideaId, "edit-2", "طلب مكرر"), "DUPLICATE_REQUEST");
  reject(() => decideMediaIdeaEdit(data, actor(data, colleague.id), ideaId, "edit-1", "approved"), "FORBIDDEN");
  reject(() => decideMediaIdeaEdit(data, actor(data, "manager"), ideaId, "edit-1", "rejected"), "FEEDBACK_REQUIRED");
  data = step(data, "manager", (d, a) => decideMediaIdeaEdit(d, a, ideaId, "edit-1", "approved", "موافق"));
  assert.equal(data.ideas[0].status, "changes"); assert.match(data.ideas[0].managerFeedback, /رقم التواصل/);
  assert.equal(data.ideas[0].editRequests?.[0].status, "approved");
  assert.ok(data.notifications.some((item) => item.recipientId === "noura" && item.title === "تعديل معتمد على الفكرة"));
  reject(() => decideMediaIdeaEdit(data, actor(data, "manager"), ideaId, "edit-1", "approved"), "INVALID_TRANSITION");
 });
