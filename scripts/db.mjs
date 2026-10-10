import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { databaseConfig, loadLocalEnv } from "./lib/env.mjs";
import { applyMigrations } from "./lib/migrations.mjs";
import { importState, verifyImport } from "./lib/import-state.mjs";

loadLocalEnv();
const command = process.argv[2];
const usage = "Usage: node scripts/db.mjs <check|migrate|import-state|verify-state> [--state path] [--server-stopped]";
if (!["check", "migrate", "import-state", "verify-state"].includes(command)) { console.error(usage); process.exit(2); }

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
  } else {
    console.log(JSON.stringify(await verifyImport(db, readState()), null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
