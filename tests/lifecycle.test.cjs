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

test("delete: owners before approval, administrators any time, with an audit copy", async () => {
  await assert.rejects(h.op("noura", { type: "deleteIdea", ideaId: "idea-001" }), expectStatus(403));
  await assert.rejects(h.op("sara", { type: "deleteIdea", ideaId: "idea-003" }), expectStatus(403));
  const own = await h.op("noura", { type: "deleteIdea", ideaId: "idea-003", reason: "لم تعد مطلوبة" });
  assert.equal(own.deletedIdeaId, "idea-003");
  assert.equal(await statusOf("idea-003"), undefined);
  const byAdmin = await h.op("admin", { type: "deleteIdea", ideaId: "idea-001" });
  assert.equal(byAdmin.deletedIdeaId, "idea-001");
  const audit = (await h.pg.query("select id, deleted_by, reason, snapshot->>'title' as title from wasl.deleted_ideas order by deleted_at")).rows;
  assert.deepEqual(audit.map((row) => [row.id, row.deleted_by]), [["idea-003", "noura"], ["idea-001", "admin"]]);
  assert.ok(audit[1].title);
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
