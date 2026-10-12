import { randomUUID } from "node:crypto";
import type { TeamMember } from "@/data/media";
import { apiAccessPolicy, audit, hashToken, newToken, tokenPrefix, type ApiPolicy } from "./api-access";
import { confirmWithAuthenticator, isAdministrator, requireUser } from "./auth";
import { database, type Queryable } from "./db";
import { assertSameOrigin, MediaServerError, readJson } from "./http";

const KEY_DAYS = [30, 90, 365];
const MAX_ACTIVE_KEYS = 10;

export const appOrigin = (request: Request) => process.env.MEDIA_APP_ORIGIN || new URL(request.url).origin;

async function allowed(actor: TeamMember, q: Queryable) {
  const policy = await apiAccessPolicy(q);
  if (!isAdministrator(actor) && policy !== "everyone") throw new MediaServerError("الوصول البرمجي متاح لمدير النظام فقط.", 403, "API_DISABLED");
  return policy;
}

type KeyRow = { id: string; member_id: string; member_name: string; kind: string; name: string; prefix: string; created_at: Date; expires_at: Date; last_used_at: Date | null; revoked_at: Date | null; client_name: string | null };

export async function readApiAccess(request: Request) {
  const db = database();
  const actor = await requireUser(request, db);
  const policy = await allowed(actor, db);
  const admin = isAdministrator(actor);
  const keys = (await db.query<KeyRow>(`select k.id, k.member_id, m.name as member_name, k.kind, k.name, k.prefix, k.created_at, k.expires_at, k.last_used_at, k.revoked_at, c.client_name
    from wasl.api_keys k join wasl.members m on m.id = k.member_id left join wasl.oauth_clients c on c.client_id = k.client_id
    where k.revoked_at is null and greatest(k.expires_at, coalesce(k.refresh_expires_at, k.expires_at)) > now() and ($1 or k.member_id = $2) order by k.created_at desc limit 200`, [admin, actor.id])).rows;
  const log = (await db.query<{ id: string; member_name: string | null; channel: string; action: string; target: string | null; status: number | null; at: Date }>(`select a.id::text as id, m.name as member_name, a.channel, a.action, a.target, a.status, a.at from wasl.api_audit a left join wasl.members m on m.id = a.member_id
    where $1 or a.member_id = $2 order by a.at desc limit 60`, [admin, actor.id])).rows;
  const origin = appOrigin(request);
  return {
    policy, canManagePolicy: admin, mcpUrl: `${origin}/api/mcp`, apiBase: `${origin}/api`,
    keys: keys.map((key) => ({ id: key.id, owner: key.member_name, ownerId: key.member_id, kind: key.kind, name: key.kind === "oauth" ? key.client_name || key.name : key.name, prefix: key.prefix, createdAt: key.created_at, expiresAt: key.expires_at, lastUsedAt: key.last_used_at })),
    audit: log.map((entry) => ({ id: entry.id, member: entry.member_name, channel: entry.channel, action: entry.action, target: entry.target, status: entry.status, at: entry.at })),
  };
}

export async function apiAccessAction(request: Request) {
  assertSameOrigin(request);
  if (/^Bearer\s+/i.test(request.headers.get("authorization") || "")) throw new MediaServerError("إدارة مفاتيح الوصول البرمجي من داخل النظام فقط، لا عبر مفتاح.", 403, "KEYS_FROM_UI_ONLY");
  const db = database();
  const actor = await requireUser(request, db);
  const body = await readJson(request, 4096) as Record<string, unknown> | null;
  const action = String(body?.action || "");
  if (action === "policy") {
    if (!isAdministrator(actor)) throw new MediaServerError("تحديد من يستخدم الوصول البرمجي متاح لمدير النظام فقط.", 403, "ADMIN_REQUIRED");
    const policy: ApiPolicy = body?.policy === "everyone" ? "everyone" : "admins";
    await db.query("update wasl.settings set api_access = $1 where id", [policy]);
    if (policy === "admins") await db.query("update wasl.api_keys k set revoked_at = now() from wasl.members m where m.id = k.member_id and k.revoked_at is null and m.role not in ('admin', 'superadmin')");
    await audit(db, { memberId: actor.id, channel: "api", action: policy === "everyone" ? "إتاحة الوصول البرمجي للفريق" : "قصر الوصول البرمجي على مديري النظام" });
    return { ok: true, policy };
  }
  await allowed(actor, db);
  if (action === "create") {
    const name = String(body?.name || "").trim().slice(0, 80);
    const days = Number(body?.days);
    if (!name) throw new MediaServerError("سمِّ المفتاح باسم يدل على استخدامه.");
    if (!KEY_DAYS.includes(days)) throw new MediaServerError("اختر مدة صلاحية المفتاح.");
    const active = Number((await db.query<{ n: string }>("select count(*) as n from wasl.api_keys where member_id = $1 and kind = 'key' and revoked_at is null and expires_at > now()", [actor.id])).rows[0].n);
    if (active >= MAX_ACTIVE_KEYS) throw new MediaServerError(`لديك ${MAX_ACTIVE_KEYS} مفاتيح فعّالة. ألغِ مفتاحاً قديماً أولاً.`, 409, "TOO_MANY_KEYS");
    await confirmWithAuthenticator(actor.id, String(body?.code || ""), db);
    const token = newToken("wasl_");
    const id = randomUUID();
    await db.query("insert into wasl.api_keys (id, member_id, kind, name, prefix, token_hash, expires_at) values ($1, $2, 'key', $3, $4, $5, now() + ($6 || ' days')::interval)", [id, actor.id, name, tokenPrefix(token), hashToken(token), String(days)]);
    await audit(db, { keyId: id, memberId: actor.id, channel: "api", action: "إنشاء مفتاح", target: name });
    return { ok: true, id, token };
  }
  if (action === "revoke") {
    const id = String(body?.id || "");
    const revoked = (await db.query("update wasl.api_keys set revoked_at = now() where id = $1 and revoked_at is null and ($2 or member_id = $3) returning id", [id, isAdministrator(actor), actor.id])).rows.length;
    if (!revoked) throw new MediaServerError("لم يُعثر على المفتاح.", 404, "NOT_FOUND");
    await audit(db, { keyId: id, memberId: actor.id, channel: "api", action: "إلغاء مفتاح" });
    return { ok: true };
  }
  throw new MediaServerError("إجراء غير معروف.");
}
