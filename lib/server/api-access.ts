import { createHash, randomBytes } from "node:crypto";
import type { Queryable } from "./db";

export type ApiPolicy = "admins" | "everyone";
export type TokenRow = { id: string; member_id: string; kind: "key" | "oauth"; last_used_at: Date | null };

const RATE_PER_MINUTE = 240;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = (prefix: "wasl_" | "waslr_" | "waslc_") => `${prefix}${randomBytes(32).toString("base64url")}`;
export const tokenPrefix = (token: string) => `${token.slice(0, 9)}…`;

export function bearerToken(request: Request) {
  const match = /^Bearer\s+(wasl_[A-Za-z0-9_-]{20,120})$/.exec(request.headers.get("authorization")?.trim() || "");
  return match ? match[1] : null;
}

export const hasBearer = (request: Request) => /^Bearer\s+/i.test(request.headers.get("authorization") || "");

export async function apiAccessPolicy(q: Queryable): Promise<ApiPolicy> {
  const row = (await q.query<{ api_access: string }>("select api_access from wasl.settings where id")).rows[0];
  return row?.api_access === "everyone" ? "everyone" : "admins";
}

export async function findActiveToken(q: Queryable, token: string) {
  return (await q.query<TokenRow>("select id, member_id, kind, last_used_at from wasl.api_keys where token_hash = $1 and revoked_at is null and expires_at > now()", [hashToken(token)])).rows[0] || null;
}

export async function touchToken(q: Queryable, row: TokenRow, address: string) {
  if (row.last_used_at && Date.now() - new Date(row.last_used_at).getTime() < 60_000) return;
  await q.query("update wasl.api_keys set last_used_at = now(), last_used_ip = $2 where id = $1", [row.id, address]);
}

export async function rateLimited(q: Queryable, keyId: string) {
  const count = Number((await q.query<{ n: string }>("select count(*) as n from wasl.api_audit where key_id = $1 and at > now() - interval '1 minute'", [keyId])).rows[0]?.n || 0);
  return count >= RATE_PER_MINUTE;
}

export async function audit(q: Queryable, entry: { keyId?: string | null; memberId?: string | null; channel: "api" | "mcp" | "oauth"; action: string; target?: string | null; status?: number }) {
  await q.query("insert into wasl.api_audit (key_id, member_id, channel, action, target, status) values ($1, $2, $3, $4, $5, $6)", [entry.keyId || null, entry.memberId || null, entry.channel, entry.action.slice(0, 200), entry.target ? entry.target.slice(0, 200) : null, entry.status ?? null]).catch(() => undefined);
}
