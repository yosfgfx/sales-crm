import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, migrationFiles } from "../scripts/lib/migrations.mjs";
import { importState, verifyImport } from "../scripts/lib/import-state.mjs";
import { createInitialMediaData, MEDIA_CATEGORIES, MEDIA_COMPANIES } from "../data/media.ts";
import { bootstrapRoot } from "../scripts/lib/bootstrap.mjs";

process.env.WASL_ENCRYPTION_KEY ||= Buffer.alloc(32, 9).toString("base64");

async function freshDatabase() {
  const pg = new PGlite();
  await pg.exec("create role anon nologin; create role authenticated nologin;");
  const db = { query: (text, params) => pg.query(text, params), exec: (sql) => pg.exec(sql) };
  return { pg, db };
}

function sampleDocument() {
  const data = createInitialMediaData();
  data.members.push({ id: "root", name: "مالك النظام", role: "superadmin", title: "", initials: "م", color: "#4338ca", active: true });
  const hash = `scrypt:${"a".repeat(48)}:${"b".repeat(128)}`;
  return { version: 3, data, authentication: { schema: 1, secret: "x".repeat(64), accounts: [{ memberId: "root", username: "root", passwordHash: hash, authVersion: 1 }] } };
}

test("migrations apply once and lock every table behind forced RLS", async () => {
  const { db } = await freshDatabase();
  const first = await applyMigrations(db);
  assert.ok(first.every((item) => item.status === "applied"));
  const second = await applyMigrations(db);
  assert.ok(second.every((item) => item.status === "skipped"));
  const open = await db.query("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wasl' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)");
  assert.deepEqual(open.rows, []);
  const anonGrants = await db.query("select table_name from information_schema.role_table_grants where table_schema = 'wasl' and grantee in ('anon', 'authenticated')");
  assert.deepEqual(anonGrants.rows, []);
});

test("state import copies every record, flags demo ideas and is idempotent", async () => {
  const { db } = await freshDatabase();
  await applyMigrations(db);
  const document = sampleDocument();
  const demoIds = document.data.ideas.map((idea) => idea.id);
  const first = await importState(db, document, { demoIdeaIds: demoIds });
  assert.deepEqual(first.inserted, first.expected);
  const verification = await verifyImport(db, document);
  assert.deepEqual(verification.mismatches, []);
  const demo = await db.query("select count(*) as n from wasl.ideas where is_demo");
  assert.equal(Number(demo.rows[0].n), demoIds.length);
  const second = await importState(db, document, { demoIdeaIds: demoIds });
  assert.ok(Object.values(second.inserted).every((count) => count === 0));
  assert.deepEqual((await verifyImport(db, document)).mismatches, []);
});

test("imported notifications are never re-sent by email and code counters continue numbering", async () => {
  const { db } = await freshDatabase();
  await applyMigrations(db);
  const document = sampleDocument();
  await importState(db, document);
  const pending = await db.query("select count(*) as n from wasl.notifications where emailed_at is null");
  assert.equal(Number(pending.rows[0].n), 0);
  const counter = await db.query("select last_value from wasl.code_counters where year = 2026");
  const highest = Math.max(...document.data.ideas.map((idea) => Number(/^IC-2026-(\d+)$/.exec(idea.code)?.[1] || 0)));
  assert.equal(counter.rows[0].last_value, highest);
});

test("a failed import rolls back completely", async () => {
  const { db } = await freshDatabase();
  await applyMigrations(db);
  const document = sampleDocument();
  document.data.ideas[1].ownerId = "missing-member";
  await assert.rejects(importState(db, document));
  const ideas = await db.query("select count(*) as n from wasl.ideas");
  assert.equal(Number(ideas.rows[0].n), 0);
});

test("bootstrapping a fresh database creates only the owner and reference lists, never demo data (H5)", async () => {
  const { db } = await freshDatabase();
  await applyMigrations(db);
  await assert.rejects(bootstrapRoot(db, { password: "short", companies: MEDIA_COMPANIES, categories: MEDIA_CATEGORIES }), /12/);
  const result = await bootstrapRoot(db, { name: "يوسف", password: "Owner-Strong-Pass-2026", companies: MEDIA_COMPANIES, categories: MEDIA_CATEGORIES });
  assert.equal(result.ideas, 0);
  const counts = (await db.query("select (select count(*) from wasl.ideas) as ideas, (select count(*) from wasl.notifications) as notices, (select count(*) from wasl.members) as members")).rows[0];
  assert.deepEqual([Number(counts.ideas), Number(counts.notices), Number(counts.members)], [0, 0, 1]);
  await assert.rejects(bootstrapRoot(db, { password: "Owner-Strong-Pass-2026", companies: [], categories: [] }), /فارغة/);
});

test("a backup restores every table into an empty database (H8)", async () => {
  const { createBackup, restoreBackup } = await import("../scripts/lib/backup.mjs");
  const source = await freshDatabase();
  await applyMigrations(source.db);
  const document = sampleDocument();
  await importState(source.db, document, { demoIdeaIds: [] });
  await source.db.query("insert into wasl.attachments (id, kind, name, size, mime, storage, local_path, owner_id) values ('logo-1', 'brief', 'logo.png', 3, 'image/png', 'local', 'files/logo-1', 'root')");
  await source.db.query("update wasl.settings set logo_attachment_id = 'logo-1'");
  const archive = await createBackup(source.db);
  assert.equal(archive.subarray(0, 7).toString("latin1"), "WASLBK1");
  assert.ok(!archive.includes(Buffer.from("password_hash")));
  const target = await freshDatabase();
  await applyMigrations(target.db);
  const restored = await restoreBackup(target.db, archive);
  assert.equal(restored.ideas, document.data.ideas.length);
  assert.equal((await target.db.query("select logo_attachment_id from wasl.settings")).rows[0].logo_attachment_id, "logo-1");
  assert.deepEqual((await verifyImport(target.db, document)).mismatches.map(({ table, source, database }) => [table, database - source]), [["attachments", 1]]);
  const channels = (await target.db.query("select channels::text[] as c from wasl.ideas order by id limit 1")).rows[0].c;
  assert.ok(Array.isArray(channels) && channels.length > 0);
  await assert.rejects(restoreBackup(target.db, archive), /فارغة/);
  const tampered = Buffer.from(archive);
  tampered[tampered.length - 1] ^= 1;
  const empty = await freshDatabase();
  await applyMigrations(empty.db);
  await assert.rejects(restoreBackup(empty.db, tampered), /فك تشفير/);
});

test("attachments stored in Supabase Storage satisfy the storage check (N1)", async () => {
  const { db } = await freshDatabase();
  await applyMigrations(db);
  await importState(db, sampleDocument());
  await db.query("insert into wasl.attachments (id, kind, name, size, mime, storage, local_path, owner_id) values ('s1', 'brief', 'a.txt', 3, 'text/plain', 'supabase', 'files/s1', 'root')");
  await assert.rejects(db.query("insert into wasl.attachments (id, kind, name, size, mime, storage, owner_id) values ('s2', 'brief', 'a.txt', 3, 'text/plain', 'supabase', 'root')"));
});

test("social backups preserve voice metadata, reversed thread rows, reactions, receipts and the singleton cursor", async () => {
  const { createBackup, restoreBackup } = await import("../scripts/lib/backup.mjs");
  const source = await freshDatabase();
  await applyMigrations(source.db);
  await importState(source.db, sampleDocument());
  const parent = "10000000-0000-4000-8000-000000000001", reply = "10000000-0000-4000-8000-000000000002", voice = "10000000-0000-4000-8000-000000000003";
  await source.db.query("insert into wasl.social_voices(id,owner_id,mime,size,duration_seconds,storage,storage_key,sha256,linked_at) values($1,'root','audio/webm',200,2,'local','social/test.webm',$2,now())", [voice, "a".repeat(64)]);
  await source.db.query("insert into wasl.social_messages(id,scope,scope_id,author_id,body) values($1,'team','main','root','رسالة أصلية')", [parent]);
  await source.db.query("insert into wasl.social_messages(id,scope,scope_id,author_id,body,parent_id,voice_id) values($1,'team','main','root','رد صوتي',$2,$3)", [reply, parent, voice]);
  await source.db.query("insert into wasl.social_reactions(message_id,member_id,emoji) values($1,'root','🎉')", [reply]);
  await source.db.query("insert into wasl.operation_receipts(request_id,actor_id,request_hash,result) values($1,'root','test-hash','{}')", ["10000000-0000-4000-8000-000000000004"]);
  const unordered = { query: async (sql, params) => { const result = await source.db.query(sql, params); return sql.includes("wasl.social_messages t") ? { ...result, rows: result.rows.reverse() } : result; } };
  const archive = await createBackup(unordered);
  const target = await freshDatabase();
  await applyMigrations(target.db);
  const counts = await restoreBackup(target.db, archive);
  assert.equal(counts.social_messages, 2);
  const restored = (await target.db.query("select parent_id,voice_id from wasl.social_messages where id=$1", [reply])).rows[0];
  assert.equal(restored.parent_id, parent); assert.equal(restored.voice_id, voice);
  assert.equal((await target.db.query("select emoji from wasl.social_reactions")).rows[0].emoji, "🎉");
  assert.equal((await target.db.query("select count(*)::int as n from wasl.operation_receipts")).rows[0].n, 1);
  assert.equal((await target.db.query("select count(*)::int as n from wasl.change_cursor")).rows[0].n, 1);
  assert.ok(Number((await target.db.query("select version from wasl.change_cursor")).rows[0].version) > 0);
  await source.pg.close(); await target.pg.close();
});

test("pre-social encrypted backups restore into upgraded tables with new column defaults", async () => {
  const { createBackup, restoreBackup } = await import("../scripts/lib/backup.mjs");
  const source = await freshDatabase();
  await applyMigrations(source.db, migrationFiles().filter((file) => file.name !== "wasl_social"));
  const document = sampleDocument();
  await importState(source.db, document);
  const archive = await createBackup(source.db);
  const target = await freshDatabase();
  await applyMigrations(target.db);
  const restored = await restoreBackup(target.db, archive);
  assert.equal(restored.ideas, document.data.ideas.length);
  assert.equal((await target.db.query("select count(*)::int as n from wasl.ideas where deletion_reason='' and deleted_at is null")).rows[0].n, document.data.ideas.length);
  assert.equal((await target.db.query("select count(*)::int as n from wasl.social_messages")).rows[0].n, 0);
  assert.equal((await target.db.query("select count(*)::int as n from wasl.change_cursor")).rows[0].n, 1);
  await source.pg.close(); await target.pg.close();
});
