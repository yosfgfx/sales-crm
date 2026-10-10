import { readFileSync } from "node:fs";
import path from "node:path";

export function loadLocalEnv(root = process.cwd()) {
  let text = "";
  try { text = readFileSync(path.join(root, ".env.local"), "utf8"); } catch { return; }
  for (const line of text.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

export function databaseConfig() {
  const ref = (process.env.SUPABASE_URL || "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (ref && password) {
    return { host: process.env.SUPABASE_DB_HOST || "aws-1-eu-central-1.pooler.supabase.com", port: Number(process.env.SUPABASE_DB_PORT || 5432), user: `postgres.${ref}`, password, database: "postgres", ssl: { rejectUnauthorized: false } };
  }
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL, ssl: process.env.WASL_DB_SSL === "disable" ? false : { rejectUnauthorized: false } };
  throw new Error("Set SUPABASE_URL and SUPABASE_DB_PASSWORD (or DATABASE_URL) in .env.local.");
}
