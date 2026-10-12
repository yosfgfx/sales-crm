import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { databaseConfig, loadLocalEnv } from "./lib/env.mjs";
import { applyMigrations } from "./lib/migrations.mjs";
import { importState, verifyImport } from "./lib/import-state.mjs";
import { bootstrapRoot } from "./lib/bootstrap.mjs";
import { BACKUP_EXTENSION, createBackup, restoreBackup } from "./lib/backup.mjs";
import { writeFileSync } from "node:fs";

loadLocalEnv();
const command = process.argv[2];
const usage = "Usage: node scripts/db.mjs <check|migrate|import-state|verify-state|bootstrap-root|backup|restore> [--state path] [--server-stopped] [--name owner-name]";
if (!["check", "migrate", "import-state", "verify-state", "bootstrap-root", "backup", "restore"].includes(command)) { console.error(usage); process.exit(2); }

const client = new pg.Client({ ...databaseConfig(), connectionTimeoutMillis: 10_000 });
const db = { query: (text, params) => client.query(text, params), exec: (sql) => client.query(sql) };

function readState() {
  const index = process.argv.indexOf("--state");
  const file = index > 0 ? process.argv[index + 1] : path.join(process.env.MEDIA_DATA_DIR || path.join(process.cwd(), ".media-data"), "state.json");
  return JSON.parse(readFileSync(file, "utf8"));
}

async function demoIdeaIds() {
  const { createInitialMediaData } = await import("../data/media.ts");
  return createInitialMediaData().ideas.map((idea) => idea.id);
}

function manifestOwner(directory) {
  return (id) => { try { return JSON.parse(readFileSync(path.join(directory, "files", `${id}.json`), "utf8")).ownerId; } catch { return undefined; } };
}

try {
  await client.connect();
  if (command === "check") {
    const row = (await client.query("select current_user, version()")).rows[0];
    console.log(JSON.stringify({ connected: true, user: row.current_user, server: row.version.split(" ").slice(0, 2).join(" ") }));
  } else if (command === "migrate") {
    console.log(JSON.stringify(await applyMigrations(db), null, 2));
  } else if (command === "import-state") {
    if (!process.argv.includes("--server-stopped")) throw new Error("Stop the app first, then pass --server-stopped so no write is lost during the copy.");
    const document = readState();
    const dataDir = process.env.MEDIA_DATA_DIR || path.join(process.cwd(), ".media-data");
    const result = await importState(db, document, { demoIdeaIds: await demoIdeaIds(), manifestOwner: manifestOwner(dataDir) });
    console.log(JSON.stringify({ ...result, verification: await verifyImport(db, document) }, null, 2));
  } else if (command === "backup") {
    const file = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : `wasl-backup-${new Date().toISOString().slice(0, 10)}${BACKUP_EXTENSION}`;
    await client.query("begin isolation level repeatable read read only");
    try {
      writeFileSync(file, await createBackup(db), { mode: 0o600 });
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    console.log(JSON.stringify({ file }));
  } else if (command === "restore") {
    if (!process.argv[3]) throw new Error("حدد ملف النسخة الاحتياطية.");
    console.log(JSON.stringify(await restoreBackup(db, readFileSync(process.argv[3]))));
  } else if (command === "bootstrap-root") {
    if (process.stdin.isTTY) throw new Error("مرّر كلمة مرور المالك عبر الإدخال القياسي، ولا تكتبها في الأمر نفسه. راجع docs/internal-comms-server.md.");
    const password = (await new Promise((resolve) => { let value = ""; process.stdin.on("data", (chunk) => { value += chunk; }).on("end", () => resolve(value)); })).replace(/\r?\n$/, "");
    const nameIndex = process.argv.indexOf("--name");
    const { MEDIA_COMPANIES, MEDIA_CATEGORIES } = await import("../data/media.ts");
    console.log(JSON.stringify(await bootstrapRoot(db, { name: nameIndex > 0 ? process.argv[nameIndex + 1] : undefined, password, companies: MEDIA_COMPANIES, categories: MEDIA_CATEGORIES })));
  } else {
    console.log(JSON.stringify(await verifyImport(db, readState()), null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
