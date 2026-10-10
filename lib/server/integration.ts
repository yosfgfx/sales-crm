import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { TeamMember } from "@/data/media";
import { retryArchive } from "./archive";
import { isAdministrator, requireUser } from "./auth";
import { encryptSecret, decryptSecret } from "./crypto";
import { database } from "./db";
import { accessToken, appOrigin, authorizationUrl, createFolder, exchangeCode, FOLDER_MIME, forgetAccessToken, getFile, loadIntegration, moveFile, revokeToken, storageQuota } from "./google";
import { assertSameOrigin, MediaServerError, readJson, responseHeaders } from "./http";

const STATE_COOKIE = "wasl_oauth_state";
const DEFAULT_FOLDER = "WaslPlatform";

function requireOwner(user: TeamMember) {
  if (user.id !== "root") throw new MediaServerError("ربط Google Drive وفصله متاحان لمالك النظام فقط.", 403, "OWNER_REQUIRED");
}
function requireAdmin(user: TeamMember) {
  if (!isAdministrator(user)) throw new MediaServerError("إدارة مجلد الأرشيف متاحة لمالك النظام ومدير النظام فقط.", 403, "ADMIN_REQUIRED");
}
const signState = (value: string) => createHmac("sha256", process.env.WASL_SESSION_SECRET || "").update(`oauth:root:${value}`).digest("base64url");
const adminRedirect = (request: Request, query: string, cookie: string) => new Response(null, { status: 303, headers: { Location: `${appOrigin(request)}/?view=admin&tab=integrations&${query}`, "Set-Cookie": cookie, "Cache-Control": "no-store" } });

export async function integrationStatus(request: Request) {
  const db = database();
  const user = await requireUser(request, db);
  const integration = await loadIntegration(db);
  const base = { connected: Boolean(integration), folderSelected: Boolean(integration?.root_folder_id) };
  if (!isAdministrator(user)) return base;
  const issues = (await db.query<{ idea_id: string; code: string; title: string; status: string; last_error: string | null; updated_at: Date }>(`select distinct on (j.idea_id) j.idea_id, i.code, i.title, j.status, j.last_error, j.updated_at from wasl.archive_jobs j join wasl.ideas i on i.id = j.idea_id
    where j.status in ('failed', 'needs_review') order by j.idea_id, j.updated_at desc`)).rows;
  const pending = Number((await db.query<{ n: string }>("select count(*) as n from wasl.archive_jobs where status in ('pending', 'running')")).rows[0].n);
  return {
    ...base, canConnect: user.id === "root", canChooseFolder: true,
    accountEmail: integration?.account_email || null, connectedAt: integration?.connected_at || null,
    rootFolder: integration?.root_folder_id ? { id: integration.root_folder_id, name: integration.root_folder_name, url: `https://drive.google.com/drive/folders/${encodeURIComponent(integration.root_folder_id)}` } : null,
    lastCheckAt: integration?.last_check_at || null, lastCheckOk: integration?.last_check_ok ?? null,
    pendingJobs: pending, issues: issues.map((issue) => ({ ideaId: issue.idea_id, code: issue.code, title: issue.title, status: issue.status, error: issue.last_error, updatedAt: issue.updated_at })),
    pickerConfigured: Boolean(process.env.GOOGLE_PICKER_API_KEY && process.env.GOOGLE_CLOUD_PROJECT_NUMBER),
  };
}

export async function startConnect(request: Request) {
  const user = await requireUser(request);
  requireOwner(user);
  const nonce = randomBytes(24).toString("base64url");
  const state = `${nonce}.${signState(nonce)}`;
  const secure = appOrigin(request).startsWith("https:");
  return new Response(null, { status: 303, headers: { Location: authorizationUrl(request, state), "Set-Cookie": `${STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/api/integrations/google; Max-Age=600${secure ? "; Secure" : ""}`, "Cache-Control": "no-store" } });
}

export async function finishConnect(request: Request) {
  const url = new URL(request.url);
  const clear = `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/integrations/google; Max-Age=0`;
  try {
    const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1) || "";
    const returned = url.searchParams.get("state") || "";
    const [nonce, signature] = returned.split(".");
    const valid = Boolean(nonce && signature && cookie === returned && signature.length === signState(nonce).length && timingSafeEqual(Buffer.from(signature), Buffer.from(signState(nonce))));
    if (!valid) throw new MediaServerError("انتهت صلاحية طلب الربط. ابدأ الربط من الإعدادات مجدداً.", 400, "OAUTH_STATE");
    if (url.searchParams.get("error")) throw new MediaServerError("أُلغي الربط من شاشة Google.", 400, "OAUTH_DENIED");
    const code = url.searchParams.get("code");
    if (!code) throw new MediaServerError("لم يُرسل Google رمز الربط.", 400, "OAUTH_CODE");
    const tokens = await exchangeCode(request, code);
    const db = database();
    const previous = await loadIntegration(db);
    await db.query(`insert into wasl.google_integration (id, account_email, refresh_token_enc, scopes, connected_by, connected_at, root_folder_id, root_folder_name, last_check_at, last_check_ok)
      values (true, $1, $2, $3, $4, now(), $5, $6, now(), true)
      on conflict (id) do update set account_email = excluded.account_email, refresh_token_enc = excluded.refresh_token_enc, scopes = excluded.scopes, connected_by = excluded.connected_by, connected_at = now(),
      root_folder_id = case when wasl.google_integration.account_email = excluded.account_email then wasl.google_integration.root_folder_id else null end,
      root_folder_name = case when wasl.google_integration.account_email = excluded.account_email then wasl.google_integration.root_folder_name else null end, last_check_at = now(), last_check_ok = true`,
    [tokens.email, encryptSecret(tokens.refreshToken), tokens.scopes, "root", previous?.root_folder_id || null, previous?.root_folder_name || null]);
    forgetAccessToken();
    return adminRedirect(request, "drive=connected", clear);
  } catch (error) {
    const code = error instanceof MediaServerError ? error.code : "OAUTH_FAILED";
    return adminRedirect(request, `drive=error&code=${encodeURIComponent(code)}`, clear);
  }
}

async function selectFolder(folderId: string, mode: "move" | "fresh", user: TeamMember) {
  const db = database();
  const integration = await loadIntegration(db);
  if (!integration) throw new MediaServerError("اربط Google Drive أولاً.", 409, "DRIVE_NOT_CONNECTED");
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) throw new MediaServerError("معرّف المجلد غير صالح. اختر المجلد من نافذة Google Drive.", 422, "DRIVE_FOLDER_INVALID");
  const folder = await getFile(folderId, db).catch(() => { throw new MediaServerError("لا يستطيع النظام الوصول إلى هذا المجلد. اختره من نافذة Google Drive داخل الإعدادات ليُمنح النظام صلاحيته.", 403, "DRIVE_FOLDER_FORBIDDEN"); });
  if (folder.mimeType !== FOLDER_MIME || folder.trashed) throw new MediaServerError("العنصر المختار ليس مجلداً متاحاً في Google Drive.", 422, "DRIVE_FOLDER_INVALID");
  const previous = integration.root_folder_id;
  if (previous && previous !== folder.id && mode === "move") {
    const tops = (await db.query<{ folder_id: string }>("select folder_id from wasl.drive_folders where root_folder_id = $1 and (key = 'in-progress' or key like 'year:%')", [previous])).rows;
    for (const top of tops) await moveFile(top.folder_id, folder.id, [previous], db);
    await db.query("update wasl.drive_folders set root_folder_id = $2 where root_folder_id = $1", [previous, folder.id]);
  }
  await db.query("update wasl.google_integration set root_folder_id = $1, root_folder_name = $2, root_selected_by = $3, root_selected_at = now() where id", [folder.id, folder.name, user.id]);
  return { id: folder.id, name: folder.name };
}

export async function integrationAction(request: Request) {
  assertSameOrigin(request);
  const body = await readJson(request, 4096) as Record<string, unknown> | null;
  const db = database();
  const user = await requireUser(request, db);
  const action = String(body?.action || "");
  switch (action) {
    case "disconnect": {
      requireOwner(user);
      const integration = await loadIntegration(db);
      if (integration) await revokeToken(decryptSecret(integration.refresh_token_enc));
      await db.query("delete from wasl.google_integration where id");
      forgetAccessToken();
      return { ok: true };
    }
    case "test": {
      requireAdmin(user);
      try {
        const quota = await storageQuota(db);
        const integration = await loadIntegration(db);
        if (integration?.root_folder_id) await getFile(integration.root_folder_id, db);
        await db.query("update wasl.google_integration set last_check_at = now(), last_check_ok = true where id");
        return { ok: true, quota };
      } catch (error) {
        await db.query("update wasl.google_integration set last_check_at = now(), last_check_ok = false where id");
        throw error;
      }
    }
    case "createDefaultFolder": {
      requireAdmin(user);
      const folder = await createFolder(DEFAULT_FOLDER, null, db);
      return { ok: true, folder: await selectFolder(folder.id, body?.mode === "move" ? "move" : "fresh", user) };
    }
    case "selectFolder": {
      requireAdmin(user);
      return { ok: true, folder: await selectFolder(String(body?.folderId || ""), body?.mode === "move" ? "move" : "fresh", user) };
    }
    case "pickerToken": {
      requireAdmin(user);
      if (!process.env.GOOGLE_PICKER_API_KEY || !process.env.GOOGLE_CLOUD_PROJECT_NUMBER) throw new MediaServerError("نافذة اختيار المجلدات غير مهيأة على الخادم.", 503, "PICKER_CONFIGURATION");
      return { accessToken: await accessToken(db), apiKey: process.env.GOOGLE_PICKER_API_KEY, appId: process.env.GOOGLE_CLOUD_PROJECT_NUMBER };
    }
    case "retryArchive": {
      requireAdmin(user);
      if (typeof body?.ideaId !== "string") throw new MediaServerError("حدد الفكرة.");
      return { ok: true, result: await retryArchive(body.ideaId, db) };
    }
    default: throw new MediaServerError("إجراء غير معروف.");
  }
}

export { responseHeaders };
