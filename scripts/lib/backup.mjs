import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

export const BACKUP_TABLES = ["members", "accounts", "companies", "categories", "settings", "ideas", "idea_events", "attachments", "quotations", "notifications", "code_counters", "google_integration", "drive_folders", "archive_jobs", "upload_sessions", "deleted_ideas", "reminders"];
const RESTORE_ORDER = [...BACKUP_TABLES.filter((table) => table !== "settings"), "settings"];
const MAGIC = Buffer.from("WASLBK1\0", "latin1");

function backupKey() {
  const key = Buffer.from(process.env.WASL_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("WASL_ENCRYPTION_KEY must be set (32 bytes, base64) to create or read an encrypted backup.");
  return key;
}

function seal(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupKey(), iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

function open(sealed) {
  if (!sealed.subarray(0, MAGIC.length).equals(MAGIC)) return sealed;
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = sealed.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = createDecipheriv("aes-256-gcm", backupKey(), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(sealed.subarray(MAGIC.length + 28)), decipher.final()]); }
  catch { throw new Error("تعذّر فك تشفير النسخة الاحتياطية. تأكد من استخدام مفتاح التشفير نفسه الذي أُنشئت به."); }
}

export const BACKUP_EXTENSION = ".json.gz.enc";

export async function createBackup(db) {
  const tables = {};
  for (const table of BACKUP_TABLES) tables[table] = (await db.query(`select to_jsonb(t) as row from wasl.${table} t`)).rows.map((row) => row.row);
  const payload = { format: "wasl-backup", version: 1, createdAt: new Date().toISOString(), tables };
  return seal(gzipSync(Buffer.from(JSON.stringify(payload))));
}

export async function restoreBackup(db, compressed) {
  const payload = JSON.parse(gunzipSync(open(Buffer.from(compressed))).toString("utf8"));
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
