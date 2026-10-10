/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads transpiled TypeScript through CommonJS. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHarness } = require("./helpers/harness.cjs");

const ROLES = ["root", "admin", "manager", "noura", "faisal"];
const ADMINS = ["root", "admin"];
let h;
const route = (file) => require(path.join(h.root, "app/api", file, "route.ts"));
const statusOf = async (call) => {
  try { const response = await call(); return response instanceof Response ? response.status : 200; }
  catch (error) { return error.status || 500; }
};
const denied = (status) => status === 401 || status === 403;

before(async () => { h = await createHarness(); });
after(async () => { await h.close(); });

const CASES = [
  { name: "GET /api/notifications", allowed: ROLES, call: (who) => route("notifications").GET(h.getRequest(`/api/notifications?before=${encodeURIComponent(new Date().toISOString())}`, h.cookies[who])) },
  { name: "GET /api/ideas/[id]", allowed: ROLES, call: (who) => route("ideas/[id]").GET(h.getRequest("/api/ideas/idea-001", h.cookies[who]), { params: Promise.resolve({ id: "idea-001" }) }) },
  { name: "GET /api/integrations/google", allowed: ROLES, call: (who) => route("integrations/google").GET(h.getRequest("/api/integrations/google", h.cookies[who])) },
  { name: "GET /api/accounts", allowed: ADMINS, call: (who) => route("accounts").GET(h.getRequest("/api/accounts", h.cookies[who])) },
  { name: "GET /api/admin/demo-data", allowed: ADMINS, call: (who) => route("admin/demo-data").GET(h.getRequest("/api/admin/demo-data", h.cookies[who])) },
  { name: "POST /api/import/ideas", allowed: ADMINS, call: (who) => route("import/ideas").POST(h.jsonRequest("/api/import/ideas", {}, { cookie: h.cookies[who] })) },
  { name: "Drive connection test", allowed: ADMINS, driveCall: true, call: (who) => route("integrations/google").POST(h.jsonRequest("/api/integrations/google", { action: "test" }, { cookie: h.cookies[who] })) },
  { name: "Drive picker token", allowed: ADMINS, driveCall: true, call: (who) => route("integrations/google").POST(h.jsonRequest("/api/integrations/google", { action: "pickerToken" }, { cookie: h.cookies[who] })) },
  { name: "Drive archive scan", allowed: ADMINS, call: (who) => route("integrations/google").POST(h.jsonRequest("/api/integrations/google", { action: "scanArchive", ideaId: "idea-001" }, { cookie: h.cookies[who] })) },
  { name: "Drive archive repair", allowed: ADMINS, call: (who) => route("integrations/google").POST(h.jsonRequest("/api/integrations/google", { action: "repairAttachment", attachmentId: "00000000-0000-4000-8000-000000000000", mode: "ignore" }, { cookie: h.cookies[who] })) },
  { name: "Drive connect", allowed: ["root"], call: (who) => route("integrations/google/start").GET(h.getRequest("/api/integrations/google/start", h.cookies[who])) },
  { name: "Drive disconnect", allowed: ["root"], call: (who) => route("integrations/google").POST(h.jsonRequest("/api/integrations/google", { action: "disconnect" }, { cookie: h.cookies[who] })) },
  { name: "add a company", allowed: ADMINS, op: (who) => ({ type: "addCompany", name: `شركة ${who}` }) },
  { name: "change settings", allowed: ADMINS, op: () => ({ type: "updateSettings", patch: { departmentName: "إدارة التواصل الداخلي" } }) },
  { name: "reassign an idea", allowed: ADMINS, op: () => ({ type: "reassignIdea", ideaId: "idea-003", ownerId: "noura" }) },
  { name: "review an idea", allowed: [...ADMINS, "manager"], op: () => ({ type: "reviewIdea", ideaId: "idea-002", decision: "changes", feedback: "ملاحظة" }) },
  { name: "create an idea", allowed: [...ADMINS, "noura"], op: (who) => ({ type: "createIdea", input: { title: `فكرة ${who}`, companyId: "mawaredcom", department: "التواصل", categoryId: "wellbeing", workType: "design", description: "", content: "", executionPlan: "", channels: ["screens"], ownerId: who, requestedAt: "2026-10-10", dueDate: "2026-10-20", priority: "normal", needsQuotes: false } }) },
];

for (const item of CASES.filter((entry) => !entry.skip)) {
  test(`permission matrix: ${item.name}`, async () => {
    for (const who of ROLES) {
      const status = await statusOf(() => item.op ? h.op(who, item.op(who)) : item.call(who));
      const allowed = item.allowed.includes(who);
      assert.equal(denied(status), !allowed, `${who} → ${status} (expected ${allowed ? "allowed" : "denied"})`);
      if (allowed) assert.ok(status < 500 || item.driveCall, `${who} → ${status} (allowed calls must not fail on the server)`);
    }
  });
}

test("permission matrix: signed-out requests are refused everywhere", async () => {
  const anonymous = [
    () => route("notifications").GET(h.getRequest(`/api/notifications?before=${encodeURIComponent(new Date().toISOString())}`)),
    () => route("ideas/[id]").GET(h.getRequest("/api/ideas/idea-001"), { params: Promise.resolve({ id: "idea-001" }) }),
    () => route("integrations/google").GET(h.getRequest("/api/integrations/google")),
    () => route("accounts").GET(h.getRequest("/api/accounts")),
    () => route("files/[id]").GET(h.getRequest("/api/files/00000000-0000-4000-8000-000000000000"), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) }),
    () => require(path.join(h.root, "lib/server/ops.ts")).runOperation(h.jsonRequest("/api/ops", { type: "addComment", ideaId: "idea-001", text: "x" })),
  ];
  for (const call of anonymous) assert.equal(await statusOf(call), 401);
});

test("permission matrix: the team sees only whether Drive is connected", async () => {
  for (const who of ["manager", "noura", "faisal"]) {
    const body = await (await route("integrations/google").GET(h.getRequest("/api/integrations/google", h.cookies[who]))).json();
    assert.deepEqual(Object.keys(body).sort(), ["connected", "folderSelected"]);
  }
});
