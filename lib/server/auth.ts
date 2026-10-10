import { createHash, createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { AccountSummary, MediaData, TeamMember } from "@/data/media";
import { addMediaMember, updateMediaMember } from "@/lib/media-workflow";
import { database, type Queryable } from "./db";
import { assertSameOrigin, clientAddress, MediaServerError, readJson, responseHeaders } from "./http";
import { loadIdeas, loadReference } from "./repository";
import { loadStateFor } from "./state";

const scrypt = promisify(nodeScrypt);
const COOKIE = "media_session";
const SESSION_SECONDS = 12 * 60 * 60;
const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,63}$/;
const UNKNOWN_ACCOUNT_HASH = `scrypt:${"0".repeat(48)}:${"0".repeat(128)}`;
const ROLES = ["admin", "manager", "content", "designer"] as const;
type Account = { member_id: string; username: string; password_hash: string; auth_version: number };

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
  return (await q.query<Account>("select member_id, username, password_hash, auth_version from wasl.accounts where member_id = $1", [memberId])).rows[0] || null;
}
async function memberById(q: Queryable, id: string) {
  return (await q.query<TeamMember>("select id, name, role::text as role, title, initials, color, active from wasl.members where id = $1", [id])).rows[0] || null;
}

export async function sessionUser(request: Request, q: Queryable = database()): Promise<TeamMember | null> {
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
  return member;
}

export async function requireUser(request: Request, q?: Queryable) {
  const user = await sessionUser(request, q);
  if (!user) throw new MediaServerError("يرجى تسجيل الدخول للمتابعة.", 401, "AUTH_REQUIRED");
  return user;
}
export function requireAdministrator(user: TeamMember) {
  if (!isAdministrator(user)) throw new MediaServerError("هذا الإجراء متاح لمدير النظام فقط.", 403, "ADMIN_REQUIRED");
}

export async function currentSession(request: Request) {
  const user = await sessionUser(request);
  return { user, demo: false, configured: true };
}

const FAILURE_WINDOW_MS = 15 * 60_000;
async function loginDelay(q: Queryable, keys: string[]) {
  const rows = await q.query<{ delay_until: Date | null }>("select delay_until from wasl.login_attempts where key = any($1::text[]) and delay_until > now()", [keys]);
  return rows.rows.length > 0;
}
async function recordFailure(q: Queryable, keys: string[]) {
  for (const key of keys) {
    await q.query(`insert into wasl.login_attempts (key, failures, window_started_at) values ($1, 1, now())
      on conflict (key) do update set failures = case when wasl.login_attempts.window_started_at < now() - interval '${FAILURE_WINDOW_MS / 60_000} minutes' then 1 else wasl.login_attempts.failures + 1 end,
      window_started_at = case when wasl.login_attempts.window_started_at < now() - interval '${FAILURE_WINDOW_MS / 60_000} minutes' then now() else wasl.login_attempts.window_started_at end`, [key]);
    await q.query("update wasl.login_attempts set delay_until = now() + least(interval '15 minutes', interval '30 seconds' * power(2, failures - 5)) where key = $1 and failures >= 5", [key]);
  }
}

export async function login(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const value = await readJson(request, 4096) as Record<string, unknown> | null;
  const identifier = value && typeof value === "object" ? (value.username ?? value.memberId) : undefined;
  if (typeof identifier !== "string" || !/^[a-zA-Z0-9_.-]{1,100}$/.test(identifier)) throw new MediaServerError("أدخل اسم مستخدم صالحاً للدخول.");
  const password = typeof value?.password === "string" ? value.password : "";
  const username = identifier.toLowerCase();
  const address = clientAddress(request);
  const keys = [`ip:${address}`, `account:${username}|ip:${address}`];
  const q = database();
  if (await loginDelay(q, keys)) throw new MediaServerError("محاولات دخول خاطئة كثيرة من هذا الجهاز. انتظر قليلاً ثم حاول مجدداً.", 429, "LOGIN_RATE_LIMIT");
  const account = (await q.query<Account>("select member_id, username, password_hash, auth_version from wasl.accounts where username = $1", [username])).rows[0];
  const verified = password.length >= 1 && password.length <= 1024 && (await passwordMatches(password, account?.password_hash || UNKNOWN_ACCOUNT_HASH)) && Boolean(account);
  const member = account ? await memberById(q, account.member_id) : null;
  if (!verified || !account || !member?.active) {
    await recordFailure(q, keys);
    throw new MediaServerError("بيانات الدخول غير صحيحة أو الحساب غير مفعّل.", 401, "INVALID_CREDENTIALS");
  }
  await q.query("delete from wasl.login_attempts where key = $1", [keys[1]]);
  return Response.json({ user: member, demo: false, configured: true }, { headers: { ...responseHeaders, "Set-Cookie": issueCookie(request, account, member) } });
}

export async function logout(request: Request): Promise<Response> {
  assertSameOrigin(request);
  return Response.json({ success: true }, { headers: { ...responseHeaders, "Set-Cookie": clearCookie(request) } });
}

async function summaries(q: Queryable): Promise<AccountSummary[]> {
  const rows = await q.query<{ id: string; username: string | null }>("select m.id, a.username from wasl.members m left join wasl.accounts a on a.member_id = m.id order by m.created_at, m.id");
  return rows.rows.map((row) => ({ memberId: row.id, username: row.username || row.id, hasPassword: Boolean(row.username), protected: row.id === "root" }));
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
      await tx.query("insert into wasl.members (id, name, title, role, initials, color, active) values ($1, $2, $3, $4::wasl.member_role, $5, $6, true)", [added.id, added.name, added.title, added.role, added.initials, added.color]);
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
      if (!account) {
        if (!passwordHash) throw new MediaServerError("هذا العضو لم يفعّل الدخول بعد. عيّن له كلمة مرور عند حفظ التعديلات.", 422, "PASSWORD_REQUIRED");
        await tx.query("insert into wasl.accounts (member_id, username, password_hash) values ($1, $2, $3)", [targetId, username, passwordHash]);
      } else {
        const identityChanged = passwordHash || account.username !== username || (["name", "title", "role", "active"] as const).some((key) => previous[key] !== updated[key]);
        await tx.query("update wasl.accounts set username = $2, password_hash = coalesce($3, password_hash), auth_version = auth_version + $4, updated_at = now() where member_id = $1", [targetId, username, passwordHash || null, identityChanged ? 1 : 0]);
      }
    }
    return { targetId };
  });
  const user = await sessionUser(request);
  const reloginRequired = !user;
  const state = user ? await loadStateFor(user) : null;
  return Response.json({ version: 0, data: state?.data, accounts: user && isAdministrator(user) ? await summaries(db) : [], currentUser: user, reloginRequired, memberId: outcome.targetId }, { headers: { ...responseHeaders, ...(reloginRequired ? { "Set-Cookie": clearCookie(request) } : {}) } });
}
