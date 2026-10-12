/* eslint-disable @typescript-eslint/no-require-imports -- Runs application transactions against an isolated in-memory PostgreSQL instance. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createHarness } = require("./helpers/harness.cjs");
let h, repository, state, created;
before(async () => { h = await createHarness(); repository = require(path.join(h.root, "lib/server/repository.ts")); state = require(path.join(h.root, "lib/server/state.ts")); });
after(async () => { if (h) await h.close(); });
const member = (id) => h.data.members.find((item) => item.id === id);
const notices = async (ideaId, action) => (await h.pg.query("select recipient_id,actor_id,actor_name,type::text as type,body,entity_type,entity_id,action from wasl.notifications where entity_id = $1 and action = $2 order by recipient_id", [ideaId, action])).rows;

test("creating and editing a new idea notify managers with the authenticated actor and immediately assigned owner", async () => {
  await h.pg.query("insert into wasl.members(id,name,role,title,initials,color,active) values('inactive-manager','مدير سابق','manager','', 'م','#555555',false)");
  const template = h.data.ideas.find((item) => item.id === "idea-008");
  const input = Object.fromEntries(["title","companyId","department","categoryId","workType","description","content","executionPlan","channels","ownerId","requestedAt","dueDate","priority","needsQuotes"].map((key) => [key, template[key]]));
  const result = await h.op("admin", { type: "createIdea", input: { ...input, title: "نشاط جديد للفريق", ownerId: "sara" }, actorId: "root", actorName: "اسم مزور", requestId: randomUUID() });
  created = result.idea;
  const fresh = await notices(created.id, "created");
  assert.deepEqual(fresh.map((notice) => notice.recipient_id), ["manager", "sara"]);
  assert.ok(fresh.every((notice) => notice.actor_id === "admin" && notice.actor_name === member("admin").name && notice.entity_type === "idea"));
  assert.equal(fresh.find((notice) => notice.recipient_id === "sara").type, "assignment");
  await h.op("sara", { type: "patchIdea", ideaId: created.id, patch: { description: "شرح أكثر دقة للفكرة" }, requestId: randomUUID() });
  assert.equal((await notices(created.id, "edited")).filter((notice) => notice.recipient_id === "manager").length, 1);
});

test("an operation receipt prevents duplicated comments, audit events and notifications after uncertain response", async () => {
  const requestId = randomUUID(), operation = { type: "addComment", ideaId: created.id, text: "تحديث واحد يصل للفريق", requestId };
  await h.op("sara", operation); await h.op("sara", operation);
  const events = (await h.pg.query("select count(*)::int as n from wasl.idea_events where idea_id=$1 and action='comment'", [created.id])).rows[0].n;
  assert.equal(events, 1);
  assert.equal((await notices(created.id, "comment")).filter((notice) => notice.recipient_id === "manager").length, 1);
  await assert.rejects(h.op("sara", { ...operation, text: "محتوى مختلف" }), (error) => error.code === "REQUEST_ID_REUSED");
  await assert.rejects(h.op("noura", operation), (error) => error.code === "REQUEST_ID_REUSED");
});

test("manager feedback revisions explicitly identify that required changes were implemented and resubmitted", async () => {
  await h.op("sara", { type: "submitIdea", ideaId: created.id });
  await h.op("manager", { type: "reviewIdea", ideaId: created.id, decision: "changes", feedback: "أكمل مواعيد التنفيذ" });
  await h.op("sara", { type: "patchIdea", ideaId: created.id, patch: { executionPlan: "تم توضيح مواعيد التنفيذ والمخرجات" } });
  assert.ok((await notices(created.id, "edited")).some((notice) => notice.recipient_id === "manager" && /نفّذ التعديلات المطلوبة/.test(notice.body)));
  await h.op("sara", { type: "submitIdea", ideaId: created.id });
  assert.ok((await notices(created.id, "submitted")).some((notice) => /معالجة ملاحظات المدير/.test(notice.body)));
});

test("administration additions, edits, archives and restores are notified with navigable entity targets", async () => {
  const added = await h.op("admin", { type: "addCompany", name: "شركة جديدة للاختبار" }); const company = added.companies.at(-1);
  assert.equal((await notices(company.id, "company_created"))[0].entity_type, "company");
  await h.op("admin", { type: "updateCompany", companyId: company.id, name: "اسم الشركة المحدّث", shortName: "اسم جديد" });
  assert.equal((await notices(company.id, "company_updated"))[0].actor_id, "admin");
  await h.op("admin", { type: "removeCompany", companyId: company.id });
  assert.equal((await h.pg.query("select active from wasl.companies where id=$1", [company.id])).rows[0].active, false);
  await h.op("admin", { type: "updateCompany", companyId: company.id, active: true });
  assert.equal((await h.pg.query("select active from wasl.companies where id=$1", [company.id])).rows[0].active, true);
  const categoryResult = await h.op("admin", { type: "addCategory", name: "تصنيف جديد للاختبار" }); const category = categoryResult.categories.at(-1);
  await h.op("admin", { type: "removeCategory", categoryId: category.id });
  assert.equal((await notices(category.id, "category_archived"))[0].entity_type, "category");
  await h.op("admin", { type: "updateCategory", categoryId: category.id, active: true });
  await h.op("admin", { type: "updateSettings", patch: { departmentName: "إدارة الاتصال" } });
  assert.equal((await notices("main", "settings_updated"))[0].entity_type, "settings");
  await assert.rejects(h.op("noura", { type: "removeCompany", companyId: company.id }), (error) => error.status === 403);
});

test("soft deleted work is visible only to admins, preserves its files, and restores all details", async () => {
  const before = (await repository.loadIdeas(h.database, { ids: ["idea-011"] }))[0];
  await assert.rejects(h.op("noura", { type: "deleteIdea", ideaId: before.id }), (error) => error.status === 403);
  const removed = await h.op("admin", { type: "deleteIdea", ideaId: before.id, reason: "أُزيل مؤقتاً" });
  assert.ok(removed.idea.deletedAt); assert.equal(removed.idea.status, "delivered"); assert.deepEqual(removed.idea.attachments, before.attachments);
  assert.equal(await state.loadIdeaFor(member("noura"), before.id, h.database), null);
  assert.ok((await state.loadStateFor(member("admin"), h.database)).data.ideas.some((idea) => idea.id === before.id && idea.deletedAt));
  assert.equal((await state.loadStateFor(member("noura"), h.database)).data.ideas.some((idea) => idea.id === before.id), false);
  await assert.rejects(h.op("noura", { type: "restoreIdea", ideaId: before.id }), (error) => error.status === 403);
  const restored = await h.op("admin", { type: "restoreIdea", ideaId: before.id });
  assert.equal(restored.idea.deletedAt, undefined); assert.deepEqual(restored.idea.attachments, before.attachments);
  assert.equal(restored.idea.history.at(-1).action, "restored");
});

test("workspace activity includes active managers once and snapshots human actors for account hooks", async () => {
  await h.database.transaction((tx) => repository.notifyWorkspaceActivity(tx, member("admin"), { entityType: "member", entityId: "noura", action: "member_updated", title: "تحديث حساب الفريق", body: "حدّث حساب عضو الفريق", recipients: ["manager", "noura", "inactive-manager", "noura"] }));
  const rows = await notices("noura", "member_updated"); assert.deepEqual(rows.map((notice) => notice.recipient_id), ["manager", "noura"]);
  assert.ok(rows.every((notice) => notice.actor_name === member("admin").name && notice.body.includes(member("admin").name)));
});


test("a deleted task stops daily reminders and pauses automatic archive work until restored", async () => {
  const scheduler = require(path.join(h.root, "lib/server/scheduler.ts")); const archive = require(path.join(h.root, "lib/server/archive.ts"));
  await h.op("admin", { type: "deleteIdea", ideaId: created.id });
  await scheduler.runDailyJobs(h.database, "2030-05-10");
  assert.equal((await h.pg.query("select count(*)::int as n from wasl.notifications where idea_id=$1 and type='reminder'", [created.id])).rows[0].n, 0);
  await h.op("admin", { type: "restoreIdea", ideaId: created.id });
  const jobId = await h.database.transaction((tx) => archive.enqueueArchive(tx, "idea-012"));
  await h.op("admin", { type: "deleteIdea", ideaId: "idea-012" });
  assert.equal(await archive.runArchiveJob(jobId, h.database), null);
  const job = (await h.pg.query("select status::text as status,attempts from wasl.archive_jobs where id=$1", [jobId])).rows[0];
  assert.equal(job.status, "pending"); assert.equal(job.attempts, 0);
  await h.op("admin", { type: "restoreIdea", ideaId: "idea-012" });
});

test("admin uploads are allowed at an approved stage, while deleted work's files are private to admins", async () => {
  const files = require(path.join(h.root, "lib/server/files.ts"));
  const form = new FormData(); form.set("ideaId", "idea-001"); form.set("kind", "brief"); form.append("files", new Blob(["safe test content"]), "reference.txt");
  const uploaded = await files.uploadFiles(new Request(`${h.ORIGIN}/api/files`, { method: "POST", headers: { origin: h.ORIGIN, cookie: h.cookies.admin }, body: form }));
  await h.op("admin", { type: "addAttachments", ideaId: "idea-001", attachmentIds: [uploaded[0].id] });
  await h.op("admin", { type: "deleteIdea", ideaId: "idea-001" });
  await assert.rejects(files.downloadFile(h.getRequest(`/api/files/${uploaded[0].id}`, h.cookies.noura), uploaded[0].id), (error) => error.status === 404);
  const adminDownload = await files.downloadFile(h.getRequest(`/api/files/${uploaded[0].id}`, h.cookies.admin), uploaded[0].id); assert.equal(await adminDownload.text(), "safe test content");
  await h.op("admin", { type: "restoreIdea", ideaId: "idea-001" });
  const restoredDownload = await files.downloadFile(h.getRequest(`/api/files/${uploaded[0].id}`, h.cookies.noura), uploaded[0].id); assert.equal(await restoredDownload.text(), "safe test content");
});


test("unfinished work restores with explicit replacement assignments when previous roles changed", async () => {
  await h.op("admin", { type: "deleteIdea", ideaId: created.id });
  await h.pg.query("update wasl.members set role='designer' where id='sara'");
  await assert.rejects(h.op("admin", { type: "restoreIdea", ideaId: created.id }), (error) => error.status === 422 && error.code === "RESTORE_ASSIGNMENT_REQUIRED" && /حدد مسؤول محتوى/.test(error.message));
  const restored = await h.op("admin", { type: "restoreIdea", ideaId: created.id, ownerId: "noura" });
  assert.equal(restored.idea.ownerId, "noura"); assert.equal(restored.idea.status, "review"); assert.equal(restored.idea.deletedAt, undefined);
  assert.match(restored.idea.history.at(-1).note, /أُعيد إسناد المحتوى/);
  const notification = (await notices(created.id, "restored")).find((notice) => notice.recipient_id === "noura"); assert.equal(notification.type, "assignment");
  await h.pg.query("update wasl.members set role='content' where id='sara'");
});

test("removing a required delivered output reopens final review and marks its archive for review", async () => {
  const idea = h.data.ideas.find((item) => item.id === "idea-012");
  const file = idea.attachments.find((item) => item.kind === "final");
  const result = await h.op("admin", { type: "removeAttachment", ideaId: idea.id, attachmentId: file.id });
  assert.equal(result.idea.status, "design_review");
  assert.equal(result.idea.deliveredAt, undefined);
  assert.equal(result.idea.archive.status, "needs_review");
  assert.ok((await notices(idea.id, "attachment_removed")).some((notice) => notice.recipient_id === "manager" && /استكمال نسخ النشر/.test(notice.body)));
});

test("changing approved quotation details requires a new manager approval", async () => {
  const ideaId = "idea-001", attachmentId = "approval-quote-file";
  await h.pg.query("insert into wasl.attachments(id,idea_id,kind,name,size,mime,storage,local_path,owner_id) values($1,$2,'quotation','quote.pdf',10,'application/pdf','local','test/quote.pdf','admin')", [attachmentId, ideaId]);
  const added = await h.op("admin", { type: "addQuotation", ideaId, quote: { id: "approval-quote", vendor: "مورد اختبار", scope: "تنفيذ الفكرة", amount: 100, days: 2, recommended: true, attachmentId } });
  assert.equal(added.idea.status, "review"); assert.equal(added.idea.approvedAt, undefined);
  assert.equal(added.idea.archive.status, "needs_review");
  assert.ok((await notices(ideaId, "quotation_added")).some((notice) => notice.recipient_id === "manager" && notice.type === "approval"));
  await h.op("manager", { type: "reviewIdea", ideaId, decision: "approved" });
  const removed = await h.op("admin", { type: "removeQuotation", ideaId, quotationId: "approval-quote" });
  assert.equal(removed.idea.status, "review"); assert.equal(removed.idea.approvedAt, undefined);
});
