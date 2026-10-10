import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

export function migrationFiles(directory = MIGRATIONS_DIR) {
  return readdirSync(directory).filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort().map((name) => ({ version: name.slice(0, 14), name: name.slice(15, -4), sql: readFileSync(path.join(directory, name), "utf8") }));
}

export async function applyMigrations(db, files = migrationFiles()) {
  await db.query("create schema if not exists supabase_migrations");
  await db.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)");
  const applied = new Set((await db.query("select version from supabase_migrations.schema_migrations")).rows.map((row) => row.version));
  const result = [];
  for (const file of files) {
    if (applied.has(file.version)) { result.push({ ...file, status: "skipped" }); continue; }
    await db.query("begin");
    try {
      await db.exec(file.sql);
      await db.query("insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)", [file.version, [file.sql], file.name]);
      await db.query("commit");
      result.push({ ...file, status: "applied" });
    } catch (error) {
      await db.query("rollback");
      throw new Error(`Migration ${file.version}_${file.name} failed: ${error.message}`);
    }
  }
  return result.map(({ version, name, status }) => ({ version, name, status }));
}
