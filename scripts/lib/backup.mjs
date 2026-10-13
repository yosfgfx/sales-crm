import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

export const BACKUP_TABLES = ["members", "accounts", "companies", "categories", "settings", "ideas", "idea_events", "attachments", "quotations", "notifications", "code_counters", "google_integration", "drive_folders", "archive_jobs", "upload_sessions", "deleted_ideas", "reminders", "job_runs", "social_voices", "social_messages", "social_reactions", "social_rate_limits", "operation_receipts", "change_cursor", "oauth_clients", "api_keys", "api_audit", "idea_edit_requests", "member_presence", "member_activity", "meetings", "tasks", "meeting_items", "meeting_attendance", "work_sessions", "honor_awards", "honor_cheers", "push_subscriptions"];
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

async function readTables(db) {
  const tables = {};
  for (const table of BACKUP_TABLES) {
    const exists = (await db.query("select to_regclass($1) as relation", [`wasl.${table}`])).rows[0]?.relation;
    if (exists) tables[table] = (await db.query(`select to_jsonb(t) as row from wasl.${table} t`)).rows.map((row) => row.row);
  }
  return tables;
}

export async function createBackup(db) {
  const tables = typeof db.transaction === "function" ? await db.transaction(async (tx) => {
    await tx.query("set transaction isolation level repeatable read, read only");
    return readTables(tx);
  }) : await readTables(db);
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
      let rows = payload.tables[table] || [];
      if (!Array.isArray(rows)) throw new Error("بيانات النسخة الاحتياطية غير صالحة.");
      if (!rows.length) continue;
      const columns = new Set((await db.query("select column_name from information_schema.columns where table_schema='wasl' and table_name=$1", [table])).rows.map((column) => column.column_name));
      if (!columns.size) throw new Error(`طبّق ترقيات قاعدة البيانات قبل استعادة الجدول ${table}.`);
      if (table === "social_messages") {
        const pending = new Map(rows.map((row) => [row.id, row])), ordered = [];
        while (pending.size) {
          const ready = [...pending.values()].filter((row) => !row.parent_id || !pending.has(row.parent_id));
          if (!ready.length) throw new Error("ترابط ردود الدردشة في النسخة الاحتياطية غير صالح.");
          for (const row of ready) { ordered.push(row); pending.delete(row.id); }
        }
        rows = ordered;
      }
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("سجل النسخة الاحتياطية غير صالح.");
        const names = Object.keys(row).filter((column) => columns.has(column)).map((column) => `"${column.replaceAll('"', '""')}"`).join(",");
        if (!names) throw new Error("سجل النسخة الاحتياطية فارغ.");
        const singleton = table === "change_cursor" ? " on conflict(id) do update set version=greatest(wasl.change_cursor.version,excluded.version)+1,last_changed_at=now()" : "";
        await db.query(`insert into wasl.${table} (${names}) select ${names} from jsonb_populate_record(null::wasl.${table}, $1::jsonb)${singleton}`, [JSON.stringify(row)]);
      }
    }
    await db.query("select setval('wasl.api_audit_id_seq', coalesce((select max(id) from wasl.api_audit), 0) + 1, false)");
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  return Object.fromEntries(RESTORE_ORDER.map((table) => [table, (payload.tables[table] || []).length]));
}
