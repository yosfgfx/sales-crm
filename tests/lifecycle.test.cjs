/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads transpiled TypeScript through CommonJS. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHarness } = require("./helpers/harness.cjs");

let h, scheduler;
const expectStatus = (status) => (error) => error.status === status;
const statusOf = async (id) => (await h.pg.query("select status::text as s from wasl.ideas where id = $1", [id])).rows[0]?.s;

before(async () => { h = await createHarness(); scheduler = require(path.join(h.root, "lib/server/scheduler.ts")); });
after(async () => h.close());

test("an administrator cannot approve an idea they own, another manager can (M1)", async () => {
  await h.pg.query("update wasl.ideas set owner_id = 'admin' where id = 'idea-002'");
  await assert.rejects(h.op("admin", { type: "reviewIdea", ideaId: "idea-002", decision: "approved" }), (error) => error.code === "SELF_APPROVAL");
  const approved = await h.op("manager", { type: "reviewIdea", ideaId: "idea-002", decision: "approved" });
  assert.equal(approved.idea.status, "approved");
});

test("submitted ideas notify managers and administrators but not the sender (M2)", async () => {
  await h.pg.query("update wasl.ideas set status = 'draft' where id = 'idea-008'");
  await h.pg.query("update wasl.ideas set execution_plan = 'خطة', department = 'التواصل', description = 'وصف', content = 'نص' where id = 'idea-008'");
  await h.op("noura", { type: "submitIdea", ideaId: "idea-008" });
  const recipients = (await h.pg.query("select recipient_id from wasl.notifications where idea_id = 'idea-008' and type = 'approval' order by recipient_id")).rows.map((row) => row.recipient_id);
  assert.deepEqual(recipients, ["admin", "manager", "root"]);
});

test("owners can withdraw from review, and managers can reject with a reason (H3)", async () => {
  const withdrawn = await h.op("noura", { type: "withdrawIdea", ideaId: "idea-008" });
  assert.equal(withdrawn.idea.status, "draft");
  await h.op("noura", { type: "submitIdea", ideaId: "idea-008" });
  await assert.rejects(h.op("manager", { type: "reviewIdea", ideaId: "idea-008", decision: "rejected" }), (error) => error.code === "FEEDBACK_REQUIRED");
  const rejected = await h.op("manager", { type: "reviewIdea", ideaId: "idea-008", decision: "rejected", feedback: "لا تتوافق مع خطة الربع" });
  assert.equal(rejected.idea.status, "rejected");
  assert.equal(rejected.idea.history.at(-1).action, "rejected");
});

test("cancel is limited to owners before approval and to administrators before delivery (H3)", async () => {
  await assert.rejects(h.op("noura", { type: "cancelIdea", ideaId: "idea-001", reason: "x" }), expectStatus(403));
  await assert.rejects(h.op("sara", { type: "cancelIdea", ideaId: "idea-003", reason: "x" }), expectStatus(403));
  const cancelled = await h.op("noura", { type: "cancelIdea", ideaId: "idea-003", reason: "تكررت مع فكرة أخرى" });
  assert.equal(cancelled.idea.status, "cancelled");
  const reopened = await h.op("admin", { type: "reopenIdea", ideaId: "idea-003", reason: "عادت الحاجة إليها" });
  assert.equal(reopened.idea.status, "draft");
});

test("delete: system administrator or department manager; restore: administrator only, preserving the original files and audited work", async () => {
  await assert.rejects(h.op("noura", { type: "deleteIdea", ideaId: "idea-001" }), expectStatus(403));
  await assert.rejects(h.op("noura", { type: "deleteIdea", ideaId: "idea-003" }), expectStatus(403));
  await assert.rejects(h.op("faisal", { type: "deleteIdea", ideaId: "idea-003" }), expectStatus(403));
  const fs = require("node:fs");
  fs.mkdirSync(path.join(h.temporary, "files"), { recursive: true });
  const blob = path.join(h.temporary, "files", "orphan-check"); fs.writeFileSync(blob, "abc");
  await h.pg.query("insert into wasl.attachments (id, kind, name, size, mime, storage, local_path, owner_id, idea_id) values ('00000000-0000-4000-8000-00000000beef', 'brief', 'a.txt', 3, 'text/plain', 'local', 'files/orphan-check', 'noura', 'idea-003')");
  const removed = await h.op("admin", { type: "deleteIdea", ideaId: "idea-003", reason: "لم تعد مطلوبة" });
  assert.ok(removed.idea.deletedAt); assert.equal(removed.idea.deletedBy, "admin");
  assert.equal(fs.existsSync(blob), true); assert.equal(await statusOf("idea-003"), "draft");
  assert.equal((await h.pg.query("select count(*)::int as n from wasl.attachments where idea_id = 'idea-003' and removed_at is null")).rows[0].n, 1);
  assert.equal((await h.pg.query("select action from wasl.idea_events where idea_id='idea-003' order by at desc,id desc limit 1")).rows[0].action, "deleted");
  await assert.rejects(h.op("noura", { type: "restoreIdea", ideaId: "idea-003" }), expectStatus(403));
  const restored = await h.op("admin", { type: "restoreIdea", ideaId: "idea-003" }); assert.equal(restored.idea.deletedAt, undefined);
  assert.equal(restored.idea.attachments.length, 1); assert.equal(fs.existsSync(blob), true);
  const byManager = await h.op("manager", { type: "deleteIdea", ideaId: "idea-003", reason: "قرار المدير" });
  assert.equal(byManager.deletedIdeaId, "idea-003");
  assert.equal((await h.pg.query("select deleted_by from wasl.ideas where id = 'idea-003'")).rows[0].deleted_by, "manager");
  await assert.rejects(h.op("manager", { type: "restoreIdea", ideaId: "idea-003" }), expectStatus(403));
  await h.op("admin", { type: "restoreIdea", ideaId: "idea-003" });
});

test("work can be reassigned at any open stage so members can be deactivated (H4)", async () => {
  await assert.rejects(h.op("noura", { type: "reassignIdea", ideaId: "idea-007", designerId: "omar" }), expectStatus(403));
  const moved = await h.op("admin", { type: "reassignIdea", ideaId: "idea-007", designerId: "omar", ownerId: "sara" });
  assert.equal(moved.idea.designerId, "omar");
  assert.equal(moved.idea.ownerId, "sara");
  const auth = require(path.join(h.root, "lib/server/auth.ts"));
  for (const id of ["idea-002", "idea-005", "idea-009"]) await h.pg.query("update wasl.ideas set owner_id = 'sara' where id = $1 and owner_id = 'noura'", [id]);
  const open = (await h.pg.query("select id from wasl.ideas where owner_id = 'noura' and status::text not in ('delivered','cancelled','rejected')")).rows;
  for (const row of open) await h.op("admin", { type: "reassignIdea", ideaId: row.id, ownerId: "sara" });
  const response = await auth.mutateAccounts(h.jsonRequest("/api/accounts", { operation: "update", memberId: "noura", patch: { active: false } }, { cookie: h.cookies.admin }));
  assert.equal(response.status, 200);
});

test("a design stage labelled as the designer's own final review", async () => {
  const { STATUS_LABELS } = require(path.join(h.root, "data/media.ts"));
  assert.equal(STATUS_LABELS.design_review, "مراجعة المصمم النهائية");
});

test("editing without changes records nothing, and unticking quotations returns to draft (L12, L13)", async () => {
  const before = (await h.pg.query("select count(*)::int as n from wasl.idea_events where idea_id = 'idea-004'")).rows[0].n;
  const current = (await h.pg.query("select title from wasl.ideas where id = 'idea-004'")).rows[0].title;
  await h.op("sara", { type: "patchIdea", ideaId: "idea-004", patch: { title: current } });
  assert.equal((await h.pg.query("select count(*)::int as n from wasl.idea_events where idea_id = 'idea-004'")).rows[0].n, before);
  const result = await h.op("sara", { type: "patchIdea", ideaId: "idea-004", patch: { needsQuotes: false } });
  assert.equal(result.idea.status, "draft");
});

test("companies and categories can be renamed and switched off by administrators (M19)", async () => {
  await assert.rejects(h.op("sara", { type: "updateCompany", companyId: "hayyen", name: "x" }), expectStatus(403));
  const renamed = await h.op("admin", { type: "updateCompany", companyId: "hayyen", name: "شركة هيّن", active: false });
  const hayyen = renamed.companies.find((company) => company.id === "hayyen");
  assert.equal(hayyen.name, "شركة هيّن");
  assert.equal(hayyen.active, false);
  const categories = (await h.op("admin", { type: "updateCategory", categoryId: "learning", name: "التعلم", active: false })).categories;
  assert.equal(categories.find((category) => category.id === "learning").active, false);
});

test("daily reminders run once a day: due soon for the responsible member, overdue to managers too (M3)", async () => {
  await h.pg.query("update wasl.ideas set due_date = '2026-10-12', status = 'designing', designer_id = 'faisal' where id = 'idea-006'");
  await h.pg.query("update wasl.ideas set due_date = '2026-10-09', status = 'review' where id = 'idea-009'");
  const first = await scheduler.runDailyJobs(h.database, "2026-10-10");
  assert.equal(first.ran, true);
  const reminders = (await h.pg.query("select recipient_id, idea_id, title from wasl.notifications where type = 'reminder' order by idea_id, recipient_id")).rows;
  assert.ok(reminders.some((row) => row.idea_id === "idea-006" && row.recipient_id === "faisal" && /يومين/.test(row.title)));
  assert.ok(reminders.some((row) => row.idea_id === "idea-009" && row.recipient_id === "manager" && /متأخر/.test(row.title)));
  const second = await scheduler.runDailyJobs(h.database, "2026-10-10");
  assert.equal(second.ran, false);
});

test("email stays off unless enabled, and pending notices are marked so they never pile up", async () => {
  delete process.env.WASL_EMAIL_ENABLED;
  const result = await scheduler.sendPendingEmails(h.database, 500);
  assert.equal(result.sent, 0);
  const left = (await h.pg.query("select count(*)::int as n from wasl.notifications where emailed_at is null and created_at > now() - interval '2 days'")).rows[0].n;
  assert.equal(left, 0);
  await h.pg.query("update wasl.notifications set emailed_at = null, email_claimed_at = now() - interval '1 minute' where id = (select id from wasl.notifications order by created_at desc limit 1)");
  await h.pg.query("update wasl.notifications set created_at = now() where id = (select id from wasl.notifications order by created_at desc limit 1)");
  assert.equal((await scheduler.sendPendingEmails(h.database, 500)).pending, 0);
  await h.pg.query("update wasl.notifications set email_claimed_at = now() - interval '10 minutes' where emailed_at is null");
  assert.equal((await scheduler.sendPendingEmails(h.database, 500)).pending, 1);
});

test("old closed ideas arrive trimmed in the overview and load in full when opened", async () => {
  const state = require(path.join(h.root, "lib/server/state.ts"));
  const auth = require(path.join(h.root, "lib/server/auth.ts"));
  const viewer = (await auth.currentSession(h.getRequest("/api/media", h.cookies.manager))).user;
  const later = Date.now() + 400 * 86_400_000;
  const overview = await state.loadStateFor(viewer, h.database, later);
  const delivered = overview.data.ideas.find((idea) => idea.id === "idea-010");
  assert.equal(delivered.partial, true);
  assert.ok(delivered.history.length <= 1);
  const open = overview.data.ideas.find((idea) => idea.status === "review");
  assert.equal(open?.partial, undefined);
  const full = await state.loadIdeaFor(viewer, "idea-010", h.database);
  assert.equal(full.partial, undefined);
  assert.ok(full.history.length >= delivered.history.length);
});

test("creating an idea ignores fields outside the editable set", async () => {
  const input = { title: "فكرة نظيفة", companyId: "mawaredcom", department: "التواصل", categoryId: "wellbeing", workType: "design", description: "وصف", content: "نص", executionPlan: "خطة", channels: ["screens"], ownerId: "admin", requestedAt: "2026-10-10", dueDate: "2026-10-20", priority: "normal", needsQuotes: false };
  const created = await h.op("admin", { type: "createIdea", input: { ...input, status: "approved", approvedAt: "2026-10-01T00:00:00.000Z", deliveredAt: "2026-10-02" } });
  assert.equal(created.idea.status, "draft");
  assert.equal(created.idea.approvedAt, undefined);
  assert.equal(created.idea.deliveredAt, undefined);
});

test("notifications load in pages, keep every unread one, and read ones older than 90 days are purged (P1.5)", async () => {
  const repository = require(path.join(h.root, "lib/server/repository.ts"));
  const route = require(path.join(h.root, "app/api/notifications/route.ts"));
  await h.pg.query("delete from wasl.notifications where recipient_id = 'sara'");
  for (let n = 0; n < 120; n++) await h.pg.query("insert into wasl.notifications (id, recipient_id, idea_id, type, title, created_at, read_at) values ($1, 'sara', 'idea-002', 'comment', $2, now() - ($3 || ' hours')::interval, case when $3::int = 100 then null else now() end)", [`page-${n}`, `إشعار ${n}`, String(n)]);
  const first = await repository.loadNotifications(h.database, "sara");
  assert.equal(first.length, 51);
  assert.ok(first.some((item) => item.id === "page-100" && !item.read));
  const page = async (cursor) => (await route.GET(h.getRequest(`/api/notifications?before=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`, h.cookies.sara))).json();
  const second = await page(first[49]);
  assert.equal(first[49].id, "page-49");
  assert.deepEqual([second.notifications[0].id, second.notifications.at(-1).id, second.more], ["page-50", "page-99", true]);
  const third = await page(second.notifications.at(-1));
  assert.deepEqual([third.notifications.length, third.more], [20, false]);
  const seen = new Set([...first, ...second.notifications, ...third.notifications].map((item) => item.id));
  assert.equal(seen.size, 120);
  await h.pg.query("delete from wasl.notifications where recipient_id = 'sara'");
  for (let n = 0; n < 130; n++) await h.pg.query("insert into wasl.notifications (id, recipient_id, idea_id, type, title, created_at, read_at) values ($1, 'sara', 'idea-002', 'reminder', 'تذكير', timestamptz '2026-10-01 09:00:00+03', now())", [`tie-${String(n).padStart(3, "0")}`]);
  const tied = new Set();
  let cursor = (await repository.loadNotifications(h.database, "sara")).map((item) => { tied.add(item.id); return item; })[49];
  for (let more = true; more;) { const next = await page(cursor); next.notifications.forEach((item) => tied.add(item.id)); more = next.more; cursor = next.notifications.at(-1); }
  assert.equal(tied.size, 130);
  await h.pg.query("insert into wasl.notifications (id, recipient_id, idea_id, type, title, created_at, read_at) values ('old-read', 'sara', 'idea-002', 'comment', 'قديم', now() - interval '100 days', now() - interval '95 days'), ('old-unread', 'sara', 'idea-002', 'comment', 'قديم', now() - interval '100 days', null), ('read-today', 'sara', 'idea-002', 'comment', 'قديم', now() - interval '100 days', now())");
  await scheduler.runDailyJobs(h.database, "2026-10-21");
  const left = (await h.pg.query("select id from wasl.notifications where id in ('old-read', 'old-unread', 'read-today') order by id")).rows.map((row) => row.id);
  assert.deepEqual(left, ["old-unread", "read-today"]);
});
