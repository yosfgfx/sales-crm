/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads transpiled TypeScript through CommonJS. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
const ts = require(path.join(root, "node_modules/typescript"));
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) { return resolve.call(this, name.startsWith("@/") ? path.join(root, name.slice(2)) : name, parent, ...args); };
require.extensions[".ts"] = function (mod, filename) {
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  mod._compile(code, filename);
};

const { PGlite } = require("@electric-sql/pglite");
const { applyMigrations } = require("../scripts/lib/migrations.mjs");
const { importState } = require("../scripts/lib/import-state.mjs");
const { createInitialMediaData } = require("../data/media.ts");
const { useDatabaseForTests } = require("../lib/server/db.ts");
const auth = require("../lib/server/auth.ts");
const ops = require("../lib/server/ops.ts");
const files = require("../lib/server/files.ts");
const state = require("../lib/server/state.ts");

const ORIGIN = "http://localhost:3000";
const PASSWORDS = { root: "Root-Owner-Pass-2026", admin: "Admin-Strong-Pass-2026", manager: "Manager-Pass-2026", noura: "Noura-Pass-2026", sara: "Sara-Pass-2026", faisal: "Faisal-Pass-2026" };
let pg, temporary;
const cookies = {};

function jsonRequest(url, value, { cookie = "", origin = ORIGIN, ip = "10.0.0.1" } = {}) {
  return new Request(`${ORIGIN}${url}`, { method: "POST", headers: { "content-type": "application/json", cookie, origin, "x-forwarded-for": ip }, body: JSON.stringify(value) });
}
const getRequest = (url, cookie) => new Request(`${ORIGIN}${url}`, { headers: { cookie } });
const asCookie = (response) => response.headers.get("set-cookie").split(";")[0];
const op = (who, body) => ops.runOperation(jsonRequest("/api/ops", body, { cookie: cookies[who] }));
async function signIn(username, password = PASSWORDS[username], ip = "10.0.0.1") { return auth.login(jsonRequest("/api/session", { username, password }, { ip })); }
const expectStatus = (status) => (error) => error.status === status;

before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "wasl-server-"));
  process.env.MEDIA_DATA_DIR = temporary;
  process.env.WASL_SESSION_SECRET = "s".repeat(64);
  delete process.env.MEDIA_APP_ORIGIN;
  pg = new PGlite();
  await pg.exec("create role anon nologin; create role authenticated nologin;");
  const db = { query: (text, params) => pg.query(text, params), exec: (sql) => pg.exec(sql) };
  await applyMigrations(db);
  const data = createInitialMediaData();
  data.members.push({ id: "root", name: "مالك النظام", role: "superadmin", title: "", initials: "م", color: "#4338ca", active: true });
  const accounts = [];
  for (const [memberId, password] of Object.entries(PASSWORDS)) accounts.push({ memberId, username: memberId, passwordHash: await auth.hashPassword(password), authVersion: 1 });
  await importState(db, { version: 1, data, authentication: { schema: 1, secret: "x".repeat(64), accounts } });
  useDatabaseForTests({ query: (text, params) => pg.query(text, params), transaction: (operation) => pg.transaction((tx) => operation({ query: (text, params) => tx.query(text, params) })) });
  for (const username of Object.keys(PASSWORDS)) cookies[username] = asCookie(await signIn(username));
});

after(async () => { useDatabaseForTests(null); await pg.close(); fs.rmSync(temporary, { recursive: true, force: true }); });

test("signed sessions resolve the member and reject tampering", async () => {
  assert.equal((await auth.currentSession(getRequest("/api/session", cookies.noura))).user.id, "noura");
  const [payload, signature] = cookies.noura.slice("media_session=".length).split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), id: "admin" })).toString("base64url");
  assert.equal((await auth.currentSession(getRequest("/api/session", `media_session=${forged}.${signature}`))).user, null);
});

test("failed logins slow down one device without locking the owner out elsewhere (M5)", async () => {
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(signIn("root", "wrong-password", "203.0.113.9"), expectStatus(401));
  await assert.rejects(signIn("root", PASSWORDS.root, "203.0.113.9"), expectStatus(429));
  const elsewhere = await signIn("root", PASSWORDS.root, "198.51.100.4");
  assert.equal(elsewhere.status, 200);
});

test("operations use server time and allocate codes from the database (M4)", async () => {
  const result = await op("noura", { type: "createIdea", input: { title: "فكرة اختبار الخادم", companyId: "mawaredcom", department: "التواصل", categoryId: "wellbeing", workType: "design", description: "وصف", content: "نص", executionPlan: "خطة", channels: ["screens"], ownerId: "noura", requestedAt: "2026-10-10", dueDate: "2026-10-20", priority: "normal", needsQuotes: false } });
  assert.match(result.idea.code, /^IC-2026-\d{3}$/);
  assert.ok(Math.abs(new Date(result.idea.createdAt).getTime() - Date.now()) < 60_000);
  const codes = (await pg.query("select code from wasl.ideas where code like 'IC-2026-0%'")).rows.map((row) => row.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("quotations and their files are hidden from designers but visible to the owner and manager (H1)", async () => {
  const form = new FormData();
  form.append("ideaId", "idea-008"); form.append("kind", "quotation"); form.append("files", new Blob(["%PDF-1.4 quote"]), "عرض.pdf");
  const uploaded = await files.uploadFiles(new Request(`${ORIGIN}/api/files`, { method: "POST", headers: { cookie: cookies.noura, origin: ORIGIN }, body: form }));
  await op("noura", { type: "addAttachments", ideaId: "idea-008", attachmentIds: [uploaded[0].id] });
  await op("noura", { type: "addQuotation", ideaId: "idea-008", quote: { id: "quote-test-1", vendor: "مورد", amount: 4500, scope: "تصميم", days: 5, attachmentId: uploaded[0].id, recommended: true } });
  const viewOf = async (who) => (await state.loadStateFor((await auth.currentSession(getRequest("/api/media", cookies[who]))).user)).data;
  const designerIdea = (await viewOf("faisal")).ideas.find((idea) => idea.id === "idea-008");
  assert.equal(designerIdea.quotations.length, 0);
  assert.ok(designerIdea.attachments.every((file) => file.kind !== "quotation"));
  assert.equal((await viewOf("manager")).ideas.find((idea) => idea.id === "idea-008").quotations[0].amount, 4500);
  assert.equal((await viewOf("noura")).ideas.find((idea) => idea.id === "idea-008").quotations.length, 1);
  await assert.rejects(files.downloadFile(getRequest(`/api/files/${uploaded[0].id}`, cookies.faisal), uploaded[0].id), expectStatus(403));
  assert.equal((await files.downloadFile(getRequest(`/api/files/${uploaded[0].id}`, cookies.manager), uploaded[0].id)).status, 200);
});

test("each member receives only their own notifications (H1)", async () => {
  const designerView = await state.loadStateFor((await auth.currentSession(getRequest("/api/media", cookies.faisal))).user);
  assert.ok(designerView.data.notifications.every((notice) => notice.recipientId === "faisal"));
});

test("uploads are bound to the idea they were uploaded for", async () => {
  const form = new FormData();
  form.append("ideaId", "idea-008"); form.append("kind", "brief"); form.append("files", new Blob(["brief"]), "brief.txt");
  const uploaded = await files.uploadFiles(new Request(`${ORIGIN}/api/files`, { method: "POST", headers: { cookie: cookies.noura, origin: ORIGIN }, body: form }));
  await assert.rejects(op("noura", { type: "addAttachments", ideaId: "idea-003", attachmentIds: [uploaded[0].id] }), expectStatus(422));
  await assert.rejects(op("sara", { type: "addAttachments", ideaId: "idea-008", attachmentIds: [uploaded[0].id] }), (error) => [403, 422].includes(error.status));
});

test("stale forms are refused while edits to different ideas never conflict (H7)", async () => {
  await assert.rejects(op("noura", { type: "patchIdea", ideaId: "idea-003", patch: { description: "تعديل" }, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }), expectStatus(409));
  const [first, second] = await Promise.all([
    op("noura", { type: "addComment", ideaId: "idea-001", text: "تعليق أول" }),
    op("sara", { type: "addComment", ideaId: "idea-002", text: "تعليق ثانٍ" }),
  ]);
  assert.equal(first.idea.history.at(-1).note, "تعليق أول");
  assert.equal(second.idea.history.at(-1).note, "تعليق ثانٍ");
  const body = JSON.stringify({ type: "addComment", ideaId: "idea-001", text: "تعليق قصير" });
  assert.ok(Buffer.byteLength(body) < 5 * 1024);
});

test("role rules are enforced on the server", async () => {
  await assert.rejects(op("noura", { type: "reviewIdea", ideaId: "idea-009", decision: "approved" }), expectStatus(403));
  await assert.rejects(op("faisal", { type: "updateSettings", patch: { departmentName: "مزورة" } }), expectStatus(403));
  await assert.rejects(ops.runOperation(jsonRequest("/api/ops", { type: "addComment", ideaId: "idea-001", text: "x" }, { cookie: cookies.noura, origin: "https://attacker.example" })), expectStatus(403));
  const approved = await op("manager", { type: "reviewIdea", ideaId: "idea-009", decision: "approved" });
  assert.equal(approved.idea.status, "approved");
  assert.equal((await pg.query("select approved_by from wasl.ideas where id = 'idea-009'")).rows[0].approved_by, "manager");
});

test("marking already-read notifications writes nothing (L11)", async () => {
  await op("faisal", { type: "markNotificationsRead" });
  const before = (await pg.query("select max(read_at) as at from wasl.notifications where recipient_id = 'faisal'")).rows[0].at;
  await op("faisal", { type: "markNotificationsRead" });
  const afterRead = (await pg.query("select max(read_at) as at from wasl.notifications where recipient_id = 'faisal'")).rows[0].at;
  assert.equal(String(afterRead), String(before));
});

test("accounts enforce password policy, protect root and revoke sessions on change (M6)", async () => {
  const create = (password) => auth.mutateAccounts(jsonRequest("/api/accounts", { operation: "create", member: { name: "عضو جديد", title: "تصميم", role: "designer" }, username: "new.designer", password }, { cookie: cookies.admin }));
  await assert.rejects(create("short"), expectStatus(422));
  const created = await (await create("New-Designer-Pass-2026")).json();
  assert.equal(created.reloginRequired, false);
  const fresh = asCookie(await signIn("new.designer", "New-Designer-Pass-2026"));
  await assert.rejects(auth.mutateAccounts(jsonRequest("/api/accounts", { operation: "update", memberId: "root", patch: { name: "x" } }, { cookie: cookies.admin })), expectStatus(403));
  await auth.mutateAccounts(jsonRequest("/api/accounts", { operation: "update", memberId: created.memberId, patch: {}, password: "Changed-Designer-Pass-2026" }, { cookie: cookies.admin }));
  assert.equal((await auth.currentSession(getRequest("/api/session", fresh))).user, null);
});
