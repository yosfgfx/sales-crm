/* eslint-disable @typescript-eslint/no-require-imports -- Runs the Drive folder lock against a real Postgres server with real connection concurrency. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
require("./helpers/harness.cjs");
const { createFakeDrive } = require("./helpers/fake-drive.cjs");

const URL = "postgres://postgres:wasl-e2e-local@localhost:54329/wasl_e2e";
const root = path.resolve(__dirname, "..");
let available = true, fake, archive, pg;
const realFetch = global.fetch;

before(async () => {
  try { execFileSync("node", [path.join(root, "e2e/seed.cjs")], { stdio: "ignore", timeout: 60_000 }); } catch { available = false; return; }
  Object.assign(process.env, { DATABASE_URL: URL, WASL_DB_SSL: "disable", SUPABASE_URL: "", SUPABASE_DB_PASSWORD: "", WASL_DB_POOL_SIZE: "8", WASL_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"), GOOGLE_OAUTH_CLIENT_ID: "client.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "secret", MEDIA_DATA_DIR: path.join(root, ".e2e-data") });
  fake = createFakeDrive();
  global.fetch = fake.handler;
  const { encryptSecret } = require(path.join(root, "lib/server/crypto.ts"));
  const { database } = require(path.join(root, "lib/server/db.ts"));
  pg = database();
  const rootFolder = await (await fake.handler("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", body: JSON.stringify({ name: "WaslPlatform", mimeType: "application/vnd.google-apps.folder" }) })).json();
  await pg.query("insert into wasl.google_integration (account_email, refresh_token_enc, scopes, root_folder_id, root_folder_name, connected_by) values ('owner@example.com', $1, 'drive.file', $2, 'WaslPlatform', 'root')", [encryptSecret("refresh-token"), rootFolder.id]);
  archive = require(path.join(root, "lib/server/archive.ts"));
});
after(() => { global.fetch = realFetch; });

test("eight parallel requests on real Postgres create one project folder and one of each subfolder (N5)", async (t) => {
  if (!available) return t.skip("Start the E2E database first: npm run e2e:db");
  const results = await Promise.all(Array.from({ length: 8 }, () => archive.ensureProjectFolders("idea-008")));
  assert.equal(new Set(results.map((result) => result.project.id)).size, 1);
  for (const kind of ["brief", "quotation", "final"]) assert.equal(new Set(results.map((result) => result.subfolders[kind])).size, 1);
  const folders = [...fake.files.values()].filter((file) => file.mimeType === "application/vnd.google-apps.folder" && !file.trashed);
  const names = folders.map((folder) => folder.name);
  assert.equal(names.filter((name) => name.startsWith("IC-")).length, 1, names.join(", "));
  assert.equal(names.filter((name) => name === "قيد التنفيذ").length, 1);
  assert.equal(names.filter((name) => name === "01 الموجز والمحتوى").length, 1);
});
