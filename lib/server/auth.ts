import { createHash, createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { AccountSummary, MediaData, TeamMember } from "@/data/media";
import { addMediaMember, updateMediaMember } from "@/lib/media-workflow";
import { apiAccessPolicy, audit, bearerToken, findActiveToken, hasBearer, rateLimited, touchToken } from "./api-access";
import { database, type Queryable } from "./db";
import { assertSameOrigin, clientAddress, MediaServerError, readJson, responseHeaders } from "./http";
import { loadIdeas, loadReference } from "./repository";
import { loadStateFor } from "./state";
import { decryptSecret, encryptSecret } from "./crypto";
import { newSecret, otpauthUri, verifyCode } from "./totp";
import QRCode from "qrcode";

const scrypt = promisify(nodeScrypt);
const COOKIE = "media_session";
const SESSION_SECONDS = 12 * 60 * 60;
const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,63}$/;
const UNKNOWN_ACCOUNT_HASH = `scrypt:${"0".repeat(48)}:${"0".repeat(128)}`;
const ROLES = ["admin", "manager", "content", "designer"] as const;
type Account = { member_id: string; username: string; password_hash: string; auth_version: number; totp_secret_enc: string | null; totp_last_step: string | number | null };
const ACCOUNT_COLUMNS = "member_id, username, password_hash, auth_version, totp_secret_enc, totp_last_step";
const mfaMissing = new WeakSet<TeamMember>();
const bearerContext = new WeakMap<TeamMember, { keyId: string; kind: "key" | "oauth" }>();
export const internalRequests = new WeakSet<Request>();
export const apiCaller = (member: TeamMember) => bearerContext.get(member) || null;
export const adminMfaRequired = () => process.env.WASL_REQUIRE_ADMIN_MFA === "true" || (process.env.NODE_ENV === "production" && process.env.WASL_REQUIRE_ADMIN_MFA !== "false");

export const isAdministrator = (member: Pick<TeamMember, "role"> | null | undefined) => member?.role === "admin" || member?.role === "superadmin";

function sessionSecret() {
  const secret = process.env.WASL_SESSION_SECRET || "";
  if (secret.length < 32) throw new MediaServerError("مفتاح جلسات الدخول غير مهيأ على الخادم. تواصل مع مسؤول النظام.", 503, "AUTH_CONFIGURATION");
  return secret;
}

export function passwordPolicy(password: string, role: TeamMember["role"]) {
  const minimum = role === "admin" || role === "superadmin" ? 12 : 10;
  if (password.length < minimum || password.length > 256) throw new MediaServerError(`أدخل كلمة مرور من ${minimum} إلى ٢٥٦ حرفاً.`, 422, "INVALID_PASSWORD");
  if (new Set(password).size < 5 || /^(?:123456|password|qwerty|admin|wasl)/i.test(password)) throw new MediaServerError("كلمة المرور سهلة التخمين. استخدم كلمات أو رموزاً متنوعة.", 422, "WEAK_PASSWORD");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(24);
  return `scrypt:${salt.toString("hex")}:${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
}

async function passwordMatches(password: string, hash: string) {
  const [, salt, expectedHex] = hash.split(":");
  const actual = (await scrypt(password, Buffer.from(salt, "hex"), 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
}

function revisionOf(account: Account, member: TeamMember) {
  return createHash("sha256").update(JSON.stringify([account.auth_version, account.username, account.password_hash, member.name, member.title, member.role, member.active])).digest("hex");
}
const sign = (payload: string) => createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

function sessionCookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(process.env.MEDIA_APP_ORIGIN || request.url).protocol === "https:";
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
function issueCookie(request: Request, account: Account, member: TeamMember) {
  const payload = Buffer.from(JSON.stringify({ id: member.id, revision: revisionOf(account, member), expires: Date.now() + SESSION_SECONDS * 1000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  return sessionCookie(request, `${payload}.${sign(payload)}`, SESSION_SECONDS);
}
const clearCookie = (request: Request) => sessionCookie(request, "", 0);

async function accountFor(q: Queryable, memberId: string) {
  return (await q.query<Account>(`select ${ACCOUNT_COLUMNS} from wasl.accounts where member_id = $1`, [memberId])).rows[0] || null;
}
async function memberById(q: Queryable, id: string) {
  return (await q.query<TeamMember>("select id, name, role::text as role, title, initials, color, active from wasl.members where id = $1", [id])).rows[0] || null;
}

async function bearerUser(request: Request, q: Queryable): Promise<TeamMember | null> {
  const token = bearerToken(request);
  const row = token ? await findActiveToken(q, token) : null;
  if (!row) return null;
  const [member, account] = await Promise.all([memberById(q, row.member_id), accountFor(q, row.member_id)]);
  if (!member?.active || !account) return null;
  if (row.kind === "oauth" && !internalRequests.has(request) && new URL(request.url).pathname !== "/api/mcp") throw new MediaServerError("رموز التطبيقات المربوطة تعمل مع خادم MCP فقط. استخدم مفتاح API للواجهة البرمجية.", 403, "OAUTH_MCP_ONLY");
  if (!isAdministrator(member) && (await apiAccessPolicy(q)) !== "everyone") throw new MediaServerError("الوصول البرمجي متاح لمدير النظام فقط.", 403, "API_DISABLED");
  if (isAdministrator(member) && adminMfaRequired() && !account.totp_secret_enc) throw new MediaServerError("فعّل التحقق بخطوتين لحساب المدير قبل استخدام الوصول البرمجي.", 403, "MFA_SETUP_REQUIRED");
  if (await rateLimited(q, row.id)) throw new MediaServerError("طلبات كثيرة عبر الوصول البرمجي. انتظر دقيقة ثم أعد المحاولة.", 429, "API_RATE_LIMIT");
  bearerContext.set(member, { keyId: row.id, kind: row.kind });
  await touchToken(q, row, clientAddress(request));
  if (!internalRequests.has(request)) await audit(q, { keyId: row.id, memberId: member.id, channel: "api", action: `${request.method} ${new URL(request.url).pathname}` });
  return member;
}

export async function sessionUser(request: Request, q: Queryable = database()): Promise<TeamMember | null> {
  if (hasBearer(request)) return bearerUser(request, q);
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || token.length > 1024) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload)), actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let parsed: { id?: unknown; revision?: unknown; expires?: unknown };
  try { parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (typeof parsed.id !== "string" || typeof parsed.expires !== "number" || parsed.expires < Date.now()) return null;
  const [member, account] = await Promise.all([memberById(q, parsed.id), accountFor(q, parsed.id)]);
  if (!member?.active || !account || parsed.revision !== revisionOf(account, member)) return null;
  if (isAdministrator(member) && adminMfaRequired() && !account.totp_secret_enc) mfaMissing.add(member);
  return member;
}

export async function requireUser(request: Request, q?: Queryable, options: { allowMissingMfa?: boolean } = {}) {
  const user = await sessionUser(request, q);
  if (!user) throw new MediaServerError("يرجى تسجيل الدخول للمتابعة.", 401, "AUTH_REQUIRED");
  if (!options.allowMissingMfa && mfaMissing.has(user)) throw new MediaServerError("فعّل التحقق بخطوتين من «حسابي» قبل متابعة العمل بحساب مدير النظام.", 403, "MFA_SETUP_REQUIRED");
  return user;
}
export function requireAdministrator(user: TeamMember) {
  if (!isAdministrator(user)) throw new MediaServerError("هذا الإجراء متاح لمدير النظام فقط.", 403, "ADMIN_REQUIRED");
  if (mfaMissing.has(user)) throw new MediaServerError("فعّل التحقق بخطوتين من «حسابي» قبل استخدام أدوات الإدارة.", 403, "MFA_SETUP_REQUIRED");
}

export async function currentSession(request: Request) {
  const db = database();
  const user = await sessionUser(request, db);
  const account = user ? await accountFor(db, user.id) : null;
  return { user, demo: false, configured: true, mfa: user ? { enabled: Boolean(account?.totp_secret_enc), required: isAdministrator(user) && adminMfaRequired() } : null };
}

const FAILURE_WINDOW_MS = 15 * 60_000;
async function loginDelay(q: Queryable, keys: string[]) {
  const rows = await q.query<{ delay_until: Date | null }>("select delay_until from wasl.login_attempts where key = any($1::text[]) and delay_until > now()", [keys]);
  return rows.rows.length > 0;
}
const thresholdOf = (key: string) => key.startsWith("acct:") ? 30 : 5;
async function reserveAttempt(q: Queryable, keys: string[]) {
  let exceeded = false;
  for (const key of keys) {
    const threshold = thresholdOf(key);
    const failures = (await q.query<{ failures: number }>(`insert into wasl.login_attempts (key, failures, window_started_at) values ($1, 1, now())
      on conflict (key) do update set failures = case when wasl.login_attempts.window_started_at < now() - interval '${FAILURE_WINDOW_MS / 60_000} minutes' then 1 else wasl.login_attempts.failures + 1 end,
      window_started_at = case when wasl.login_attempts.window_started_at < now() - interval '${FAILURE_WINDOW_MS / 60_000} minutes' then now() else wasl.login_attempts.window_started_at end
      returning failures`, [key])).rows[0].failures;
    const cap = key.startsWith("acct:") ? "interval '5 minutes'" : "interval '15 minutes'";
    if (failures >= threshold) await q.query(`update wasl.login_attempts set delay_until = now() + least(${cap}, interval '30 seconds' * power(2, failures - $2)) where key = $1`, [key, threshold]);
    if (failures > threshold) exceeded = true;
  }
  return exceeded;
}
async function releaseAttempt(q: Queryable, keys: string[]) {
  await q.query("update wasl.login_attempts set failures = greatest(failures - 1, 0), delay_until = case when failures - 1 < (case when key like 'acct:%' then 30 else 5 end) then null else delay_until end where key = any($1::text[])", [keys]);
}

export async function login(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const value = await readJson(request, 4096) as Record<string, unknown> | null;
  const identifier = value && typeof value === "object" ? (value.username ?? value.memberId) : undefined;
  if (typeof identifier !== "string" || !/^[a-zA-Z0-9_.-]{1,100}$/.test(identifier)) throw new MediaServerError("أدخل اسم مستخدم صالحاً للدخول.");
  const password = typeof value?.password === "string" ? value.password : "";
  const username = identifier.toLowerCase();
  const address = clientAddress(request);
  const keys = [`ip:${address}`, `account:${username}|ip:${address}`, `acct:${username}`];
  const q = database();
  const limited = () => new MediaServerError("محاولات دخول خاطئة كثيرة. انتظر قليلاً ثم حاول مجدداً.", 429, "LOGIN_RATE_LIMIT");
  if (await loginDelay(q, keys)) throw limited();
  if (await reserveAttempt(q, keys)) throw limited();
  const account = (await q.query<Account>(`select ${ACCOUNT_COLUMNS} from wasl.accounts where username = $1`, [username])).rows[0];
  const verified = password.length >= 1 && password.length <= 1024 && (await passwordMatches(password, account?.password_hash || UNKNOWN_ACCOUNT_HASH)) && Boolean(account);
  const member = account ? await memberById(q, account.member_id) : null;
  if (!verified || !account || !member?.active) {
    throw new MediaServerError("بيانات الدخول غير صحيحة أو الحساب غير مفعّل.", 401, "INVALID_CREDENTIALS");
  }
  if (account.totp_secret_enc) {
    const code = typeof value?.code === "string" ? value.code.replace(/\s/g, "") : "";
    if (!code) {
      await releaseAttempt(q, keys);
      throw new MediaServerError("أدخل رمز التحقق من تطبيق المصادقة.", 401, "MFA_REQUIRED");
    }
    const step = verifyCode(decryptSecret(account.totp_secret_enc), code, Date.now(), account.totp_last_step === null ? null : Number(account.totp_last_step));
    if (step === null) {
      throw new MediaServerError("رمز التحقق غير صحيح أو انتهت صلاحيته.", 401, "INVALID_MFA");
    }
    await q.query("update wasl.accounts set totp_last_step = $2 where member_id = $1", [account.member_id, step]);
  }
  await q.query("delete from wasl.login_attempts where key = any($1::text[])", [[keys[1], keys[2]]]);
  await releaseAttempt(q, [keys[0]]);
  return Response.json({ user: member, demo: false, configured: true }, { headers: { ...responseHeaders, "Set-Cookie": issueCookie(request, account, member) } });
}

export async function logout(request: Request): Promise<Response> {
  assertSameOrigin(request);
  return Response.json({ success: true }, { headers: { ...responseHeaders, "Set-Cookie": clearCookie(request) } });
}

async function summaries(q: Queryable): Promise<AccountSummary[]> {
  const rows = await q.query<{ id: string; username: string | null; email: string | null }>("select m.id, a.username, m.email from wasl.members m left join wasl.accounts a on a.member_id = m.id order by m.created_at, m.id");
  return rows.rows.map((row) => ({ memberId: row.id, username: row.username || row.id, hasPassword: Boolean(row.username), protected: row.id === "root", email: row.email || "" }));
}

function normalizedEmail(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())) throw new MediaServerError("أدخل بريداً إلكترونياً صالحاً أو اتركه فارغاً.", 422, "INVALID_EMAIL");
  return value.trim().toLowerCase();
}

export async function readAccounts(request: Request) {
  const actor = await requireUser(request);
  requireAdministrator(actor);
  return { version: 0, accounts: await summaries(database()) };
}

function normalizedUsername(value: unknown) {
  if (typeof value !== "string" || !USERNAME_PATTERN.test(value.trim())) throw new MediaServerError("اسم المستخدم يجب أن يتكون من ٢ إلى ٦٤ حرفاً إنجليزياً أو رقماً، ويمكن استخدام النقطة والشرطة والشرطة السفلية.", 422, "INVALID_USERNAME");
  return value.trim().toLowerCase();
}

async function workflowSlice(q: Queryable, memberId?: string): Promise<MediaData> {
  const reference = await loadReference(q);
  const ideaIds = memberId ? (await q.query<{ id: string }>("select id from wasl.ideas where status not in ('delivered', 'cancelled', 'rejected') and (owner_id = $1 or designer_id = $1)", [memberId])).rows.map((row) => row.id) : [];
  return { ...reference, ideas: ideaIds.length ? await loadIdeas(q, { ids: ideaIds }) : [], notifications: [] };
}

export async function mutateAccounts(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const submitted = await readJson(request, 16_384) as Record<string, unknown> | null;
  if (!submitted || typeof submitted !== "object" || !["create", "update"].includes(String(submitted.operation))) throw new MediaServerError("بيانات الحساب غير مكتملة.", 422, "INVALID_ACCOUNT");
  const db = database();
  const outcome = await db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtext('wasl.accounts'))");
    const actor = await requireUser(request, tx);
    requireAdministrator(actor);
    let targetId: string;
    if (submitted.operation === "create") {
      const member = submitted.member as Record<string, unknown> | undefined;
      if (!member || Object.keys(member).some((key) => !["name", "title", "role"].includes(key)) || typeof member.name !== "string" || typeof member.title !== "string" || !ROLES.includes(member.role as typeof ROLES[number]) || typeof submitted.password !== "string") throw new MediaServerError("أدخل بيانات العضو واسم المستخدم وكلمة المرور.", 422, "INVALID_ACCOUNT");
      const username = normalizedUsername(submitted.username);
      if (username === "root" || (await tx.query("select 1 from wasl.accounts where username = $1", [username])).rows.length) throw new MediaServerError("اسم المستخدم مستخدم بالفعل أو محجوز لمالك النظام.", 409, "USERNAME_EXISTS");
      passwordPolicy(submitted.password, member.role as TeamMember["role"]);
      const slice = await workflowSlice(tx);
      const next = addMediaMember(slice, actor, member as Parameters<typeof addMediaMember>[2]);
      const added = next.members.find((candidate) => !slice.members.some((old) => old.id === candidate.id))!;
      targetId = added.id;
      await tx.query("insert into wasl.members (id, name, title, role, initials, color, active, email) values ($1, $2, $3, $4::wasl.member_role, $5, $6, true, $7)", [added.id, added.name, added.title, added.role, added.initials, added.color, normalizedEmail(submitted.email) ?? null]);
      await tx.query("insert into wasl.accounts (member_id, username, password_hash) values ($1, $2, $3)", [added.id, username, await hashPassword(submitted.password)]);
    } else {
      if (typeof submitted.memberId !== "string" || !submitted.patch || typeof submitted.patch !== "object") throw new MediaServerError("اختر العضو والبيانات المطلوب تعديلها.", 422, "INVALID_ACCOUNT");
      targetId = submitted.memberId;
      const patch = submitted.patch as Record<string, unknown>;
      if (Object.keys(patch).some((key) => !["name", "title", "role", "active"].includes(key)) || ("role" in patch && !ROLES.includes(patch.role as typeof ROLES[number]))) throw new MediaServerError("بيانات تعديل العضو غير صالحة.", 422, "INVALID_ACCOUNT");
      if (targetId === "root" && actor.id !== "root") throw new MediaServerError("حساب root محمي؛ يحرره مالك النظام فقط.", 403, "ROOT_PROTECTED");
      if (targetId === "root" && (("active" in patch && patch.active !== true) || "role" in patch)) throw new MediaServerError("لا يمكن تعطيل حساب root أو تغيير صلاحية مالك النظام.", 403, "ROOT_PROTECTED");
      const previous = await memberById(tx, targetId);
      if (!previous) throw new MediaServerError("العضو غير موجود.", 404, "MEMBER_NOT_FOUND");
      const slice = await workflowSlice(tx, targetId);
      const next = Object.keys(patch).length ? updateMediaMember(slice, actor, targetId, patch as Parameters<typeof updateMediaMember>[3]) : slice;
      const updated = next.members.find((member) => member.id === targetId)!;
      const account = await accountFor(tx, targetId);
      const username = "username" in submitted ? normalizedUsername(submitted.username) : account?.username || targetId.toLowerCase();
      if ((username === "root") !== (targetId === "root") || (await tx.query("select 1 from wasl.accounts where username = $1 and member_id <> $2", [username, targetId])).rows.length) throw new MediaServerError("اسم المستخدم مستخدم بالفعل أو محجوز لمالك النظام.", 409, "USERNAME_EXISTS");
      if ("password" in submitted && typeof submitted.password !== "string") throw new MediaServerError("أدخل كلمة مرور صالحة.", 422, "INVALID_PASSWORD");
      if (typeof submitted.password === "string") passwordPolicy(submitted.password, updated.role);
      const passwordHash = typeof submitted.password === "string" ? await hashPassword(submitted.password) : undefined;
      await tx.query("update wasl.members set name = $2, title = $3, role = $4::wasl.member_role, initials = $5, active = $6, updated_at = now() where id = $1", [targetId, updated.name, updated.title, updated.role, updated.initials, updated.active]);
      const email = normalizedEmail(submitted.email);
      if (email !== undefined) await tx.query("update wasl.members set email = $2 where id = $1", [targetId, email]);
      if (!account) {
        if (!passwordHash) throw new MediaServerError("هذا العضو لم يفعّل الدخول بعد. عيّن له كلمة مرور عند حفظ التعديلات.", 422, "PASSWORD_REQUIRED");
        await tx.query("insert into wasl.accounts (member_id, username, password_hash) values ($1, $2, $3)", [targetId, username, passwordHash]);
      } else {
        const identityChanged = passwordHash || account.username !== username || (["name", "title", "role", "active"] as const).some((key) => previous[key] !== updated[key]);
        await tx.query("update wasl.accounts set username = $2, password_hash = coalesce($3, password_hash), auth_version = auth_version + $4, updated_at = now() where member_id = $1", [targetId, username, passwordHash || null, identityChanged ? 1 : 0]);
        if (passwordHash || account.username !== username || previous.role !== updated.role || previous.active !== updated.active) await revokeProgrammaticAccess(tx, targetId);
      }
    }
    return { targetId };
  });
  const user = await sessionUser(request);
  const reloginRequired = !user;
  const state = user ? await loadStateFor(user) : null;
  return Response.json({ version: 0, data: state?.data, accounts: user && isAdministrator(user) ? await summaries(db) : [], currentUser: user, reloginRequired, memberId: outcome.targetId }, { headers: { ...responseHeaders, ...(reloginRequired ? { "Set-Cookie": clearCookie(request) } : {}) } });
}

async function runMfa(request: Request): Promise<{ data: Record<string, unknown>; cookie?: string }> {
  assertSameOrigin(request);
  const db = database();
  const user = await requireUser(request, db, { allowMissingMfa: true });
  const body = await readJson(request, 1024) as { action?: string; code?: string } | null;
  const account = await accountFor(db, user.id);
  if (!account) throw new MediaServerError("الحساب غير موجود.", 404, "ACCOUNT_NOT_FOUND");
  const code = String(body?.code || "").replace(/\s/g, "");
  if (body?.action === "start") {
    if (account.totp_secret_enc) throw new MediaServerError("التحقق بخطوتين مفعّل بالفعل.", 409, "MFA_ENABLED");
    const secret = newSecret();
    await db.query("update wasl.accounts set totp_pending_enc = $2 where member_id = $1", [user.id, encryptSecret(secret)]);
    const uri = otpauthUri(secret, account.username);
    return { data: { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) } };
  }
  if (body?.action === "confirm") {
    const pending = (await db.query<{ totp_pending_enc: string | null }>("select totp_pending_enc from wasl.accounts where member_id = $1", [user.id])).rows[0]?.totp_pending_enc;
    if (!pending) throw new MediaServerError("ابدأ تفعيل التحقق بخطوتين أولاً.", 409, "MFA_NOT_STARTED");
    const step = verifyCode(decryptSecret(pending), code);
    if (step === null) throw new MediaServerError("الرمز غير صحيح. تأكد من ضبط وقت الجوال وأعد المحاولة.", 422, "INVALID_MFA");
    await db.query("update wasl.accounts set totp_secret_enc = totp_pending_enc, totp_pending_enc = null, totp_enabled_at = now(), totp_last_step = $2, auth_version = auth_version + 1, updated_at = now() where member_id = $1", [user.id, step]);
    await revokeProgrammaticAccess(db, user.id);
    return { data: { enabled: true }, cookie: await reissue(request, db, user) };
  }
  if (body?.action === "disable") {
    if (!account.totp_secret_enc) return { data: { enabled: false } };
    if (isAdministrator(user) && adminMfaRequired()) throw new MediaServerError("التحقق بخطوتين إلزامي لمديري النظام.", 403, "MFA_REQUIRED_FOR_ADMINS");
    const lastStep = account.totp_last_step === null ? null : Number(account.totp_last_step);
    if (verifyCode(decryptSecret(account.totp_secret_enc), code, Date.now(), lastStep) === null) throw new MediaServerError("أدخل رمزاً صحيحاً لم يُستخدم من قبل لإيقاف التحقق بخطوتين.", 422, "INVALID_MFA");
    await db.query("update wasl.accounts set totp_secret_enc = null, totp_enabled_at = null, totp_last_step = null, auth_version = auth_version + 1, updated_at = now() where member_id = $1", [user.id]);
    await revokeProgrammaticAccess(db, user.id);
    return { data: { enabled: false }, cookie: await reissue(request, db, user) };
  }
  throw new MediaServerError("إجراء غير معروف.");
}

async function reissue(request: Request, q: Queryable, member: TeamMember) {
  const account = await accountFor(q, member.id);
  return account ? issueCookie(request, account, member) : undefined;
}

export async function mfaAction(request: Request) {
  return (await runMfa(request)).data;
}

export async function mfaResponse(request: Request) {
  const { data, cookie } = await runMfa(request);
  return Response.json(data, { headers: { ...responseHeaders, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}

export async function revokeProgrammaticAccess(q: Queryable, memberId: string) {
  await q.query("update wasl.api_keys set revoked_at = now() where member_id = $1 and revoked_at is null", [memberId]);
}

export async function confirmWithAuthenticator(memberId: string, code: string, q: Queryable = database()) {
  const account = await accountFor(q, memberId);
  if (!account?.totp_secret_enc) throw new MediaServerError("فعّل التحقق بخطوتين من «حسابي» أولاً. لا تُنشأ مفاتيح الوصول البرمجي من دونه.", 403, "MFA_REQUIRED_FOR_KEYS");
  const keys = [`mfa:${memberId}`];
  const limited = () => new MediaServerError("محاولات رمز تحقق خاطئة كثيرة. انتظر قليلاً ثم أعد المحاولة.", 429, "MFA_RATE_LIMIT");
  if (await loginDelay(q, keys)) throw limited();
  if (await reserveAttempt(q, keys)) throw limited();
  const lastStep = account.totp_last_step === null ? null : Number(account.totp_last_step);
  const step = verifyCode(decryptSecret(account.totp_secret_enc), String(code || "").replace(/\s/g, ""), Date.now(), lastStep);
  if (step === null) throw new MediaServerError("رمز التحقق غير صحيح أو استُخدم من قبل.", 422, "INVALID_MFA");
  const claimed = (await q.query("update wasl.accounts set totp_last_step = $2 where member_id = $1 and (totp_last_step is null or totp_last_step < $2) returning 1", [memberId, step])).rows.length;
  if (!claimed) throw new MediaServerError("رمز التحقق استُخدم للتو. انتظر الرمز التالي.", 422, "INVALID_MFA");
  await q.query("delete from wasl.login_attempts where key = any($1::text[])", [keys]);
}
