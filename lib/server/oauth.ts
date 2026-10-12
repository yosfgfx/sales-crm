import { createHash, randomUUID } from "node:crypto";
import { apiAccessPolicy, audit, hashToken, newToken, tokenPrefix } from "./api-access";
import { adminMfaRequired, confirmWithAuthenticator, isAdministrator, requireUser } from "./auth";
import { database, type Queryable } from "./db";
import { appOrigin } from "./api-keys";
import { assertSameOrigin, clientAddress, limitedBody, MediaServerError, readJson } from "./http";

const ACCESS_SECONDS = 60 * 60;
const REFRESH_DAYS = 30;
const CODE_SECONDS = 5 * 60;
const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript|blob|about):/i;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export const oauthJson = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...corsHeaders, ...extra } });
const oauthError = (error: string, description: string, status = 400) => oauthJson({ error, error_description: description }, status);

export const mcpResource = (origin: string) => `${origin}/api/mcp`;

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["wasl"],
    service_documentation: `${origin}/guide`,
  };
}

export function protectedResourceMetadata(origin: string) {
  return { resource: mcpResource(origin), authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: ["wasl"], resource_name: "وصل" };
}

export function validRedirect(uri: string) {
  if (uri.length > 500 || BLOCKED_SCHEMES.test(uri)) return false;
  let url: URL;
  try { url = new URL(uri); } catch { return false; }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return /^[a-z][a-z0-9+.-]{2,40}:$/.test(url.protocol);
}

async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") || "";
  const text = new TextDecoder().decode(await limitedBody(request, 16 * 1024));
  if (type.includes("application/json")) {
    const value = JSON.parse(text || "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string").map(([key, item]) => [key, String(item)]));
  }
  return Object.fromEntries(new URLSearchParams(text));
}

export async function registerClient(request: Request) {
  const db = database();
  let body: Record<string, unknown>;
  try { body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 16 * 1024))) as Record<string, unknown>; } catch { return oauthError("invalid_client_metadata", "Body must be JSON."); }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) return oauthError("invalid_redirect_uri", "Use https redirect URIs, a localhost URI, or an app scheme.");
  const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (method !== "none") return oauthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method=none) are supported.");
  const address = clientAddress(request);
  const recent = Number((await db.query<{ n: string }>("select count(*) as n from wasl.api_audit where channel = 'oauth' and action = 'register' and target = $1 and at > now() - interval '1 hour'", [address])).rows[0].n);
  const total = Number((await db.query<{ n: string }>("select count(*) as n from wasl.oauth_clients")).rows[0].n);
  if (recent >= 20 || total >= 2000) return oauthError("temporarily_unavailable", "Too many client registrations. Try again later.", 429);
  const name = (typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "تطبيق خارجي").slice(0, 120);
  const clientId = `wasl-client-${randomUUID()}`;
  await db.query("insert into wasl.oauth_clients (client_id, client_name, redirect_uris) values ($1, $2, $3)", [clientId, name, uris]);
  await audit(db, { channel: "oauth", action: "register", target: address });
  return oauthJson({ client_id: clientId, client_name: name, redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", client_id_issued_at: Math.floor(Date.now() / 1000) }, 201);
}

async function loadClient(q: Queryable, clientId: string) {
  return (await q.query<{ client_id: string; client_name: string; redirect_uris: string[] }>("select client_id, client_name, redirect_uris from wasl.oauth_clients where client_id = $1", [clientId])).rows[0] || null;
}

export async function describeClient(request: Request) {
  const params = new URL(request.url).searchParams;
  const client = await loadClient(database(), params.get("client_id") || "");
  const redirect = params.get("redirect_uri") || "";
  if (!client || !client.redirect_uris.includes(redirect)) throw new MediaServerError("طلب الربط غير صالح. ابدأ الربط من التطبيق مجدداً.", 400, "INVALID_CLIENT");
  return { name: client.client_name, redirectHost: new URL(redirect).host || new URL(redirect).protocol };
}

export async function approveAuthorization(request: Request) {
  assertSameOrigin(request);
  if (/^Bearer\s+/i.test(request.headers.get("authorization") || "")) throw new MediaServerError("يوافق المستخدم على الربط بنفسه من المتصفح.", 403, "INTERACTIVE_ONLY");
  const db = database();
  const actor = await requireUser(request, db);
  const body = await readJson(request, 8192) as Record<string, unknown> | null;
  const get = (key: string) => (typeof body?.[key] === "string" ? String(body[key]) : "");
  const client = await loadClient(db, get("client_id"));
  const redirect = get("redirect_uri");
  if (!client || !client.redirect_uris.includes(redirect)) throw new MediaServerError("طلب الربط غير صالح. ابدأ الربط من التطبيق مجدداً.", 400, "INVALID_CLIENT");
  const target = new URL(redirect);
  const state = get("state");
  if (state) target.searchParams.set("state", state);
  target.searchParams.set("iss", appOrigin(request));
  if (body?.approve !== true) {
    target.searchParams.set("error", "access_denied");
    return { redirect: target.toString() };
  }
  if (get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(get("code_challenge"))) throw new MediaServerError("التطبيق لم يرسل رمز الحماية PKCE المطلوب.", 400, "PKCE_REQUIRED");
  const resource = get("resource");
  if (resource && ![mcpResource(appOrigin(request)), appOrigin(request)].includes(resource.replace(/\/$/, ""))) throw new MediaServerError("المورد المطلوب لا يتبع هذا النظام.", 400, "INVALID_RESOURCE");
  if (!isAdministrator(actor) && (await apiAccessPolicy(db)) !== "everyone") throw new MediaServerError("ربط التطبيقات متاح لمدير النظام فقط.", 403, "API_DISABLED");
  await confirmWithAuthenticator(actor.id, get("code"), db);
  const code = newToken("waslc_");
  await db.query("insert into wasl.oauth_codes (code_hash, client_id, member_id, redirect_uri, code_challenge, resource, expires_at) values ($1, $2, $3, $4, $5, $6, now() + ($7 || ' seconds')::interval)", [hashToken(code), client.client_id, actor.id, redirect, get("code_challenge"), resource || null, String(CODE_SECONDS)]);
  await audit(db, { memberId: actor.id, channel: "oauth", action: "authorize", target: client.client_name });
  target.searchParams.set("code", code);
  return { redirect: target.toString() };
}

async function issueTokens(q: Queryable, memberId: string, client: { client_id: string; client_name: string }) {
  const access = newToken("wasl_");
  const refresh = newToken("waslr_");
  await q.query(`insert into wasl.api_keys (id, member_id, kind, name, prefix, token_hash, refresh_hash, client_id, expires_at, refresh_expires_at)
    values ($1, $2, 'oauth', $3, $4, $5, $6, $7, now() + ($8 || ' seconds')::interval, now() + ($9 || ' days')::interval)`,
  [randomUUID(), memberId, client.client_name, tokenPrefix(access), hashToken(access), hashToken(refresh), client.client_id, String(ACCESS_SECONDS), String(REFRESH_DAYS)]);
  await q.query("update wasl.oauth_clients set last_used_at = now() where client_id = $1", [client.client_id]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: "wasl" };
}

async function memberStillAllowed(q: Queryable, memberId: string) {
  const row = (await q.query<{ role: string; active: boolean; totp: boolean }>("select m.role::text as role, m.active, a.totp_secret_enc is not null as totp from wasl.members m join wasl.accounts a on a.member_id = m.id where m.id = $1", [memberId])).rows[0];
  if (!row?.active) return false;
  const admin = isAdministrator({ role: row.role as never });
  if (!admin && (await apiAccessPolicy(q)) !== "everyone") return false;
  return !(admin && adminMfaRequired() && !row.totp);
}

export async function tokenEndpoint(request: Request) {
  let params: Record<string, string>;
  try { params = await readParams(request); } catch { return oauthError("invalid_request", "Unreadable request body."); }
  const db = database();
  const client = await loadClient(db, params.client_id || "");
  if (!client) return oauthError("invalid_client", "Unknown client.", 401);
  if (params.grant_type === "authorization_code") {
    if (!params.code || !params.code_verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(params.code_verifier)) return oauthError("invalid_request", "code and a valid code_verifier are required.");
    const used = (await db.query<{ member_id: string; redirect_uri: string; code_challenge: string; client_id: string }>(
      "update wasl.oauth_codes set used_at = now() where code_hash = $1 and used_at is null and expires_at > now() returning member_id, redirect_uri, code_challenge, client_id", [hashToken(params.code)])).rows[0];
    if (!used || used.client_id !== client.client_id || used.redirect_uri !== params.redirect_uri) return oauthError("invalid_grant", "The code is invalid, expired or already used.");
    const challenge = createHash("sha256").update(params.code_verifier).digest("base64url");
    if (challenge !== used.code_challenge) return oauthError("invalid_grant", "PKCE verification failed.");
    if (!(await memberStillAllowed(db, used.member_id))) return oauthError("invalid_grant", "This account may no longer use programmatic access.");
    await audit(db, { memberId: used.member_id, channel: "oauth", action: "token", target: client.client_name });
    return oauthJson(await issueTokens(db, used.member_id, client));
  }
  if (params.grant_type === "refresh_token") {
    if (!params.refresh_token) return oauthError("invalid_request", "refresh_token is required.");
    const hash = hashToken(params.refresh_token);
    return db.transaction(async (tx) => {
      const row = (await tx.query<{ id: string; member_id: string; revoked_at: Date | null; refresh_expires_at: Date }>("select id, member_id, revoked_at, refresh_expires_at from wasl.api_keys where refresh_hash = $1 and client_id = $2 for update", [hash, client.client_id])).rows[0];
      if (!row) return oauthError("invalid_grant", "Unknown refresh token.");
      if (row.revoked_at) {
        await tx.query("update wasl.api_keys set revoked_at = now() where member_id = $1 and client_id = $2 and revoked_at is null", [row.member_id, client.client_id]);
        return oauthError("invalid_grant", "Refresh token reuse detected; the connection was revoked.");
      }
      if (new Date(row.refresh_expires_at).getTime() < Date.now() || !(await memberStillAllowed(tx, row.member_id))) return oauthError("invalid_grant", "The refresh token has expired or access was withdrawn.");
      await tx.query("update wasl.api_keys set revoked_at = now() where id = $1", [row.id]);
      return oauthJson(await issueTokens(tx, row.member_id, client));
    });
  }
  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export async function revokeEndpoint(request: Request) {
  let params: Record<string, string>;
  try { params = await readParams(request); } catch { return oauthJson({}); }
  if (params.token) {
    const hash = hashToken(params.token);
    await database().query("update wasl.api_keys set revoked_at = now() where kind = 'oauth' and revoked_at is null and (token_hash = $1 or refresh_hash = $1)", [hash]);
  }
  return oauthJson({});
}
