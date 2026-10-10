import { gunzipSync, gzipSync } from "node:zlib";

export const BACKUP_TABLES = ["members", "accounts", "companies", "categories", "settings", "ideas", "idea_events", "attachments", "quotations", "notifications", "code_counters", "google_integration", "drive_folders", "archive_jobs", "upload_sessions", "deleted_ideas", "reminders"];
const RESTORE_ORDER = BACKUP_TABLES;

export async function createBackup(db) {
  const tables = {};
  for (const table of BACKUP_TABLES) tables[table] = (await db.query(`select to_jsonb(t) as row from wasl.${table} t`)).rows.map((row) => row.row);
  const payload = { format: "wasl-backup", version: 1, createdAt: new Date().toISOString(), tables };
  return gzipSync(Buffer.from(JSON.stringify(payload)));
}

export async function restoreBackup(db, compressed) {
  const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
  if (payload.format !== "wasl-backup" || payload.version !== 1) throw new Error("ملف النسخة الاحتياطية غير صالح.");
  const existing = Number((await db.query("select count(*) as n from wasl.members")).rows[0].n);
  if (existing > 0) throw new Error("الاستعادة تعمل على قاعدة بيانات فارغة فقط لتجنب خلط البيانات.");
  await db.query("begin");
  try {
    for (const table of RESTORE_ORDER) {
      const rows = payload.tables[table] || [];
      for (const row of rows) await db.query(`insert into wasl.${table} select * from jsonb_populate_record(null::wasl.${table}, $1::jsonb)`, [JSON.stringify(row)]);
    }
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  return Object.fromEntries(RESTORE_ORDER.map((table) => [table, (payload.tables[table] || []).length]));
}
