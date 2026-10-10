import { database, type Queryable } from "./db";
import { decryptSecret } from "./crypto";
import { MediaServerError } from "./http";

export const DRIVE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];
export const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
let cachedToken: { value: string; expires: number; refreshHash: string } | null = null;

export function oauthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID, clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new MediaServerError("بيانات ربط Google غير مهيأة على الخادم. تواصل مع مسؤول النظام.", 503, "GOOGLE_CONFIGURATION");
  return { clientId, clientSecret };
}

export function appOrigin(request: Request) {
  if (process.env.MEDIA_APP_ORIGIN) return new URL(process.env.MEDIA_APP_ORIGIN).origin;
  const url = new URL(request.url);
  const host = request.headers.get("host");
  return host ? `${url.protocol}//${host}` : url.origin;
}
export const redirectUri = (request: Request) => `${appOrigin(request)}/api/integrations/google/callback`;

export function authorizationUrl(request: Request, state: string) {
  const params = new URLSearchParams({ client_id: oauthClient().clientId, redirect_uri: redirectUri(request), response_type: "code", scope: DRIVE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const { clientId, clientSecret } = oauthClient();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const result = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string; error?: string };
  return { ok: response.ok, ...result };
}

export async function exchangeCode(request: Request, code: string) {
  const result = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(request) });
  if (!result.ok || !result.refresh_token || !result.access_token) throw new MediaServerError("تعذّر إكمال ربط Google. أعد المحاولة ووافق على صلاحية Drive.", 502, "GOOGLE_EXCHANGE_FAILED");
  const granted = (result.scope || "").split(" ");
  if (!granted.includes("https://www.googleapis.com/auth/drive.file")) throw new MediaServerError("لم تُمنح صلاحية Google Drive. أعد الربط وفعّل خيار Drive في شاشة الموافقة.", 422, "GOOGLE_SCOPE_MISSING");
  let email = "";
  try { email = JSON.parse(Buffer.from(String(result.id_token).split(".")[1], "base64url").toString("utf8")).email || ""; } catch { /* Email is informational. */ }
  return { refreshToken: result.refresh_token, accessToken: result.access_token, expiresIn: result.expires_in || 3600, email, scopes: result.scope || "" };
}

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?${new URLSearchParams({ token })}`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}

export type Integration = { account_email: string; refresh_token_enc: string; scopes: string; root_folder_id: string | null; root_folder_name: string | null; connected_by: string; connected_at: Date; last_check_at: Date | null; last_check_ok: boolean | null };
export async function loadIntegration(q: Queryable = database()) {
  return (await q.query<Integration>("select account_email, refresh_token_enc, scopes, root_folder_id, root_folder_name, connected_by, connected_at, last_check_at, last_check_ok from wasl.google_integration where id")).rows[0] || null;
}
export function forgetAccessToken() { cachedToken = null; }

export async function accessToken(q: Queryable = database()) {
  const integration = await loadIntegration(q);
  if (!integration) throw new MediaServerError("لم يُربط Google Drive بعد. يربطه مالك النظام من الإعدادات.", 409, "DRIVE_NOT_CONNECTED");
  if (cachedToken && cachedToken.refreshHash === integration.refresh_token_enc && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const result = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptSecret(integration.refresh_token_enc) });
  if (!result.ok || !result.access_token) {
    await q.query("update wasl.google_integration set last_check_at = now(), last_check_ok = false where id");
    throw new MediaServerError(result.error === "invalid_grant" ? "انتهت صلاحية ربط Google Drive أو أُلغيت. يجب على مالك النظام إعادة الربط من الإعدادات." : "تعذّر توثيق Google Drive الآن. أعد المحاولة بعد قليل.", 502, result.error === "invalid_grant" ? "DRIVE_REAUTH_REQUIRED" : "DRIVE_AUTH_FAILED");
  }
  cachedToken = { value: result.access_token, expires: Date.now() + (result.expires_in || 3600) * 1000, refreshHash: integration.refresh_token_enc };
  return cachedToken.value;
}

export class DriveError extends MediaServerError {}
async function driveError(response: Response) {
  let reason = "";
  try { reason = ((await response.json()) as { error?: { errors?: { reason?: string }[] } }).error?.errors?.[0]?.reason || ""; } catch { /* Third-party bodies are not shown. */ }
  if (reason === "storageQuotaExceeded") return new DriveError("مساحة Google Drive ممتلئة. يجب على مالك النظام توفير مساحة إضافية.", 507, "DRIVE_STORAGE_QUOTA");
  if (response.status === 416) return new DriveError("النطاق المطلوب خارج حجم الملف.", 416, "RANGE_NOT_SATISFIABLE");
  if (response.status === 404) return new DriveError("لم يُعثر على الملف أو المجلد في Google Drive. ربما حُذف أو نُقل.", 404, "DRIVE_NOT_FOUND");
  if (response.status === 403) return new DriveError("لا يملك النظام صلاحية على هذا العنصر في Google Drive.", 403, "DRIVE_FORBIDDEN");
  if (response.status === 401) { forgetAccessToken(); return new DriveError("انتهت جلسة Google Drive. أعد المحاولة.", 502, "DRIVE_AUTH_FAILED"); }
  return new DriveError("تعذّر الاتصال بـ Google Drive. أعد المحاولة بعد قليل.", 502, "DRIVE_UNAVAILABLE");
}

export async function drive(path: string, init: RequestInit & { base?: string } = {}, q?: Queryable) {
  const token = await accessToken(q);
  const { base, ...rest } = init;
  const response = await fetch(`${base || DRIVE}${path}`, { ...rest, headers: { Authorization: `Bearer ${token}`, ...(rest.headers || {}) }, cache: "no-store", signal: rest.signal || AbortSignal.timeout(60_000) });
  if (!response.ok) throw await driveError(response);
  return response;
}

export type DriveFile = { id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean; webViewLink?: string; size?: string };
const FILE_FIELDS = "id,name,mimeType,parents,trashed,webViewLink,size";

export async function getFile(id: string, q?: Queryable): Promise<DriveFile> {
  return (await drive(`/files/${encodeURIComponent(id)}?${new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: "true" })}`, {}, q)).json();
}

export async function createFolder(name: string, parentId: string | null, q?: Queryable): Promise<DriveFile> {
  return (await drive(`/files?${new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: "true" })}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }) }, q)).json();
}

export async function moveFile(id: string, newParent: string, oldParents: string[], q?: Queryable) {
  const params = new URLSearchParams({ addParents: newParent, removeParents: oldParents.filter((parent) => parent !== newParent).join(","), fields: FILE_FIELDS, supportsAllDrives: "true" });
  return (await drive(`/files/${encodeURIComponent(id)}?${params}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }, q)).json() as Promise<DriveFile>;
}

export async function untrashFile(id: string, q?: Queryable) {
  return (await drive(`/files/${encodeURIComponent(id)}?${new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: "true" })}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: false }) }, q)).json() as Promise<DriveFile>;
}

export async function deleteFile(id: string, q?: Queryable) {
  await drive(`/files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: "DELETE" }, q);
}

export async function storageQuota(q?: Queryable) {
  const about = await (await drive("/about?fields=storageQuota,user(emailAddress)", {}, q)).json() as { storageQuota?: { limit?: string; usage?: string } };
  return { limit: Number(about.storageQuota?.limit || 0), usage: Number(about.storageQuota?.usage || 0) };
}

export async function startResumable(input: { name: string; parentId: string; mime: string; size: number; appProperties?: Record<string, string> }, q?: Queryable) {
  const response = await drive(`/files?${new URLSearchParams({ uploadType: "resumable", supportsAllDrives: "true", fields: FILE_FIELDS })}`, {
    base: UPLOAD, method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": input.mime, "X-Upload-Content-Length": String(input.size) },
    body: JSON.stringify({ name: input.name, parents: [input.parentId], ...(input.appProperties ? { appProperties: input.appProperties } : {}) }),
  }, q);
  const location = response.headers.get("location");
  const target = location ? new URL(location) : null;
  if (!target || target.protocol !== "https:" || target.hostname !== "www.googleapis.com" || !target.pathname.startsWith("/upload/drive/")) throw new DriveError("لم يُعد Google Drive رابط رفع صالحاً. أعد المحاولة.", 502, "DRIVE_UPLOAD_FAILED");
  return target.toString();
}

export async function sendChunk(sessionUri: string, bytes: Uint8Array, offset: number, total: number): Promise<{ done: true; file: DriveFile } | { done: false; received: number }> {
  const response = await fetch(sessionUri, { method: "PUT", headers: { "Content-Length": String(bytes.length), "Content-Range": `bytes ${offset}-${offset + bytes.length - 1}/${total}` }, body: bytes as BodyInit, cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (response.status === 308) {
    const range = response.headers.get("range");
    return { done: false, received: range ? Number(range.split("-")[1]) + 1 : 0 };
  }
  if (!response.ok) throw await driveError(response);
  return { done: true, file: await response.json() as DriveFile };
}

export async function uploadedBytes(sessionUri: string, total: number) {
  const response = await fetch(sessionUri, { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${total}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (response.status === 308) { const range = response.headers.get("range"); return range ? Number(range.split("-")[1]) + 1 : 0; }
  if (response.ok) return total;
  throw await driveError(response);
}

export async function uploadWhole(input: { name: string; parentId: string; mime: string; bytes: Uint8Array; appProperties?: Record<string, string> }, q?: Queryable) {
  const session = await startResumable({ name: input.name, parentId: input.parentId, mime: input.mime, size: input.bytes.length, appProperties: input.appProperties }, q);
  const result = await sendChunk(session, input.bytes, 0, input.bytes.length);
  if (!result.done) throw new DriveError("لم يكتمل رفع الملف إلى Google Drive. أعد المحاولة.", 502, "DRIVE_UPLOAD_FAILED");
  return result.file;
}

export async function createGoogleDocFromHtml(name: string, html: string, parentId: string, q?: Queryable) {
  const boundary = `wasl${Date.now()}`;
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId], mimeType: "application/vnd.google-apps.document" })}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`;
  return (await drive(`/files?${new URLSearchParams({ uploadType: "multipart", supportsAllDrives: "true", fields: FILE_FIELDS })}`, { base: UPLOAD, method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body }, q)).json() as Promise<DriveFile>;
}

export async function exportPdf(fileId: string, q?: Queryable) {
  return new Uint8Array(await (await drive(`/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf`, {}, q)).arrayBuffer());
}

export async function streamFile(fileId: string, q?: Queryable, range?: string) {
  return drive(`/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { signal: AbortSignal.timeout(10 * 60_000), ...(range ? { headers: { Range: range } } : {}) }, q);
}
