/* eslint-disable @typescript-eslint/no-require-imports -- Node test harness loads transpiled TypeScript through CommonJS. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const root = path.resolve(__dirname, "..", "..");
const ts = require(path.join(root, "node_modules/typescript"));

if (!require.extensions[".ts"]) {
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (name, parent, ...args) { return resolve.call(this, name.startsWith("@/") ? path.join(root, name.slice(2)) : name, parent, ...args); };
  require.extensions[".ts"] = function (mod, filename) {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  };
}

const ORIGIN = "http://localhost:3000";
const PASSWORDS = { root: "Root-Owner-Pass-2026", admin: "Admin-Strong-Pass-2026", manager: "Manager-Pass-2026", noura: "Noura-Pass-2026", sara: "Sara-Pass-2026", faisal: "Faisal-Pass-2026", omar: "Omar-Pass-2026" };

async function createHarness() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "wasl-test-"));
  Object.assign(process.env, { MEDIA_DATA_DIR: temporary, WASL_SESSION_SECRET: "s".repeat(64), WASL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), GOOGLE_OAUTH_CLIENT_ID: "client.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "secret", GOOGLE_PICKER_API_KEY: "picker-key", GOOGLE_CLOUD_PROJECT_NUMBER: "123" });
  delete process.env.MEDIA_APP_ORIGIN;
  const { PGlite } = require("@electric-sql/pglite");
  const { applyMigrations } = require(path.join(root, "scripts/lib/migrations.mjs"));
  const { importState } = require(path.join(root, "scripts/lib/import-state.mjs"));
  const { createInitialMediaData } = require(path.join(root, "data/media.ts"));
  const { useDatabaseForTests } = require(path.join(root, "lib/server/db.ts"));
  const auth = require(path.join(root, "lib/server/auth.ts"));
  const ops = require(path.join(root, "lib/server/ops.ts"));
  const pg = new PGlite();
  await pg.exec("create role anon nologin; create role authenticated nologin;");
  const raw = { query: (text, params) => pg.query(text, params), exec: (sql) => pg.exec(sql) };
  await applyMigrations(raw);
  const data = createInitialMediaData();
  data.members.push({ id: "root", name: "مالك النظام", role: "superadmin", title: "", initials: "م", color: "#4338ca", active: true });
  const accounts = [];
  for (const [memberId, password] of Object.entries(PASSWORDS)) accounts.push({ memberId, username: memberId, passwordHash: await auth.hashPassword(password), authVersion: 1 });
  await importState(raw, { version: 1, data, authentication: { schema: 1, secret: "x".repeat(64), accounts } }, { demoIdeaIds: data.ideas.map((idea) => idea.id) });
  const database = { query: (text, params) => pg.query(text, params), transaction: (operation) => pg.transaction((tx) => operation({ query: (text, params) => tx.query(text, params) })) };
  useDatabaseForTests(database);
  const jsonRequest = (url, value, { cookie = "", origin = ORIGIN, ip = "10.0.0.1", method = "POST" } = {}) => new Request(`${ORIGIN}${url}`, { method, headers: { "content-type": "application/json", cookie, origin, "x-forwarded-for": ip }, body: JSON.stringify(value) });
  const getRequest = (url, cookie = "") => new Request(`${ORIGIN}${url}`, { headers: { cookie } });
  const cookies = {};
  for (const username of Object.keys(PASSWORDS)) cookies[username] = (await auth.login(jsonRequest("/api/session", { username, password: PASSWORDS[username] }))).headers.get("set-cookie").split(";")[0];
  const op = (who, body) => ops.runOperation(jsonRequest("/api/ops", body, { cookie: cookies[who] }));
  const close = async () => { useDatabaseForTests(null); await pg.close(); fs.rmSync(temporary, { recursive: true, force: true }); };
  return { pg, database, cookies, op, jsonRequest, getRequest, ORIGIN, root, temporary, close, data };
}

module.exports = { createHarness, ORIGIN, PASSWORDS };
