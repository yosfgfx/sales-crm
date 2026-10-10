/* eslint-disable @typescript-eslint/no-require-imports -- Copies the owner's encrypted Drive grant into the disposable E2E database and points it at a separate test folder. */
const fs = require("node:fs");
const path = require("node:path");
require("../tests/helpers/harness.cjs");
const { Client } = require("pg");

const root = path.resolve(__dirname, "..");
const local = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n").map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim())).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(["'])(.*)\1$/, "$2")]));
const TEST_FOLDER = "WaslPlatform - اختبار آلي";

async function main() {
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(local.SUPABASE_URL || "")?.[1];
  if (!ref || !local.SUPABASE_DB_PASSWORD) throw new Error("Supabase settings are missing from .env.local.");
  const production = new Client({ host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, password: local.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
  await production.connect();
  const grant = (await production.query("select account_email, refresh_token_enc, scopes from wasl.google_integration where id")).rows[0];
  await production.end();
  if (!grant) throw new Error("Drive is not connected in production.");
  const e2e = new Client({ connectionString: process.env.DATABASE_URL });
  await e2e.connect();
  await e2e.query("insert into wasl.google_integration (account_email, refresh_token_enc, scopes, connected_by) values ($1, $2, $3, 'root')", [grant.account_email, grant.refresh_token_enc, grant.scopes]);
  const google = require(path.join(root, "lib/server/google.ts"));
  const folder = await google.createFolder(TEST_FOLDER, null);
  await e2e.query("update wasl.google_integration set root_folder_id = $1, root_folder_name = $2, root_selected_by = 'root', root_selected_at = now() where id", [folder.id, TEST_FOLDER]);
  await e2e.end();
  fs.writeFileSync(path.join(root, ".e2e-data", "live-folder.json"), JSON.stringify({ id: folder.id, name: TEST_FOLDER }));
  console.log("Linked the test database to a fresh Drive test folder.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
