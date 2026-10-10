/* eslint-disable @typescript-eslint/no-require-imports -- Seeds the disposable E2E database through the same loaders the unit tests use. */
const fs = require("node:fs");
const path = require("node:path");
require("../tests/helpers/harness.cjs");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");
const ADMIN_URL = process.env.WASL_E2E_ADMIN_URL || "postgres://postgres:wasl-e2e-local@localhost:54329/postgres";
const DATABASE = "wasl_e2e";
const PASSWORDS = require("./accounts.json");

async function main() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DATABASE} with (force)`);
  await admin.query("drop role if exists wasl_app");
  await admin.query(`create database ${DATABASE}`);
  for (const role of ["anon", "authenticated"]) await admin.query(`do $$ begin create role ${role} nologin; exception when duplicate_object then null; end $$`);
  await admin.end();
  const client = new Client({ connectionString: ADMIN_URL.replace(/\/postgres$/, `/${DATABASE}`) });
  await client.connect();
  const raw = { query: (text, params) => client.query(text, params), exec: (sql) => client.query(sql) };
  const { applyMigrations } = require(path.join(root, "scripts/lib/migrations.mjs"));
  const { importState } = require(path.join(root, "scripts/lib/import-state.mjs"));
  const { createInitialMediaData } = require(path.join(root, "data/media.ts"));
  const auth = require(path.join(root, "lib/server/auth.ts"));
  await applyMigrations(raw);
  const data = createInitialMediaData();
  data.members.push({ id: "root", name: "مالك النظام", role: "superadmin", title: "", initials: "م", color: "#4338ca", active: true });
  const accounts = [];
  for (const [memberId, password] of Object.entries(PASSWORDS)) accounts.push({ memberId, username: memberId, passwordHash: await auth.hashPassword(password), authVersion: 1 });
  await importState(raw, { version: 1, data, authentication: { schema: 1, secret: "x".repeat(64), accounts } }, { demoIdeaIds: [] });
  await client.end();
  fs.rmSync(path.join(root, ".e2e-data"), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, ".e2e-data"), { recursive: true });
}

main().then(() => console.log("E2E database seeded."), (error) => { console.error(error); process.exit(1); });
