import { Pool, type PoolConfig } from "pg";
import { MediaServerError } from "./http";

export interface Queryable {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}
export interface Database extends Queryable {
  transaction<T>(operation: (tx: Queryable) => Promise<T>): Promise<T>;
}

let override: Database | null = null;
let pooled: Database | null = null;

export function useDatabaseForTests(database: Database | null) { override = database; }

function poolConfig(): PoolConfig {
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(process.env.SUPABASE_URL || "")?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;
  const shared = { max: Number(process.env.WASL_DB_POOL_SIZE || 5), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, ssl: process.env.WASL_DB_SSL === "disable" ? false : { rejectUnauthorized: false } };
  if (ref && password) return { ...shared, host: process.env.SUPABASE_DB_HOST || "aws-1-eu-central-1.pooler.supabase.com", port: Number(process.env.SUPABASE_DB_PORT || 5432), user: `postgres.${ref}`, password, database: "postgres" };
  if (process.env.DATABASE_URL) return { ...shared, connectionString: process.env.DATABASE_URL };
  throw new MediaServerError("قاعدة بيانات النظام غير مهيأة. يجب على المسؤول ضبط اتصال Supabase في إعدادات الخادم.", 503, "DATABASE_CONFIGURATION");
}

export function database(): Database {
  if (override) return override;
  if (pooled) return pooled;
  const pool = new Pool(poolConfig());
  pool.on("error", () => {});
  const created: Database = {
    query: async <Row,>(text: string, params?: unknown[]) => (await pool.query(text, params)) as unknown as { rows: Row[] },
    transaction: async (operation) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await operation({ query: async <Row,>(text: string, params?: unknown[]) => (await client.query(text, params)) as unknown as { rows: Row[] } });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally { client.release(); }
    },
  };
  pooled = created;
  return created;
}
