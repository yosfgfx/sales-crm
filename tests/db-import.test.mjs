import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../scripts/lib/migrations.mjs";
import { importState, verifyImport } from "../scripts/lib/import-state.mjs";
import { createInitialMediaData, MEDIA_CATEGORIES, MEDIA_COMPANIES } from "../data/media.ts";
import { bootstrapRoot } from "../scripts/lib/bootstrap.mjs";

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
  const archive = await createBackup(source.db);
  const target = await freshDatabase();
  await applyMigrations(target.db);
  const restored = await restoreBackup(target.db, archive);
  assert.equal(restored.ideas, document.data.ideas.length);
  assert.deepEqual((await verifyImport(target.db, document)).mismatches, []);
  const channels = (await target.db.query("select channels::text[] as c from wasl.ideas order by id limit 1")).rows[0].c;
  assert.ok(Array.isArray(channels) && channels.length > 0);
  await assert.rejects(restoreBackup(target.db, archive), /فارغة/);
});
