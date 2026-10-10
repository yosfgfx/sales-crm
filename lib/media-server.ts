import { createHash, createHmac, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual, createSign } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createInitialMediaData, type Attachment, type MediaData, type TeamMember, type VersionedMediaData } from "@/data/media";
import { addMediaMember, updateMediaMember, validateMediaData, validateMediaMutation } from "@/lib/media-workflow";

const scrypt = promisify(nodeScrypt);
const COOKIE = "media_session";
const SESSION_SECONDS = 12 * 60 * 60;
const FILE_LIMIT = 25 * 1024 * 1024;
const UPLOAD_LIMIT = 100 * 1024 * 1024;
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,63}$/;
const STORED_USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{1,100}$/;
const PASSWORD_HASH_PATTERN = /^scrypt:[a-f0-9]{32,128}:[a-f0-9]{128}$/;
const UNKNOWN_ACCOUNT_HASH = `scrypt:${"0".repeat(48)}:${"0".repeat(128)}`;
type ManagedAccount = { memberId: string; username: string; passwordHash: string; authVersion: number };
type ManagedAuthentication = { schema: 1; secret: string; accounts: ManagedAccount[] };
type StoredMediaDocument = VersionedMediaData & { authentication?: ManagedAuthentication };
const operationalAdmin = (member: TeamMember) => member.role === "admin" || String(member.role) === "superadmin";

export class MediaServerError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_REQUEST", public detail?: unknown) { super(message); }
}

export const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function apiError(error: unknown): Response {
  if (error instanceof MediaServerError) return Response.json({ error: error.message, code: error.code, ...(error.detail ? { current: error.detail } : {}) }, { status: error.status, headers: responseHeaders });
  if (error instanceof Error && "status" in error && typeof error.status === "number") return Response.json({ error: error.message, code: "code" in error ? error.code : "INVALID_REQUEST" }, { status: error.status, headers: responseHeaders });
  // Error details may contain private keys, filesystem paths, or third-party responses.
  console.error("Internal communications API failed:", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: "تعذّر تنفيذ الطلب. حاول مجدداً أو تواصل مع مسؤول النظام.", code: "SERVER_ERROR" }, { status: 500, headers: responseHeaders });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let expected = new URL(request.url).origin;
  if (process.env.MEDIA_APP_ORIGIN) {
    try { expected = new URL(process.env.MEDIA_APP_ORIGIN).origin; } catch { throw new MediaServerError("عنوان النظام في إعدادات الخادم غير صالح. راجع مسؤول النظام.", 503, "ORIGIN_CONFIGURATION"); }
  } else {
    // Next may canonicalize request.url to localhost even when the browser uses 127.0.0.1.
    // Browsers control Host; compare its validated origin, rather than the rewritten URL host.
    const host = request.headers.get("host");
    if (host) {
      if (!/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d{1,5})?$/.test(host)) throw new MediaServerError("عنوان الطلب غير صالح.", 403, "INVALID_ORIGIN");
      try { expected = new URL(`${new URL(request.url).protocol}//${host}`).origin; } catch { throw new MediaServerError("عنوان الطلب غير صالح.", 403, "INVALID_ORIGIN"); }
    }
  }
  if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") throw new MediaServerError("لا يمكن تنفيذ الطلب من موقع آخر. افتح النظام مباشرةً وحاول مجدداً.", 403, "INVALID_ORIGIN");
}

export function dataDirectory() {
  const directory = process.env.MEDIA_DATA_DIR;
  if (directory) {
    if (!path.isAbsolute(directory)) throw new MediaServerError("يجب أن يكون مسار حفظ البيانات على الخادم مساراً كاملاً.", 503, "STORAGE_CONFIGURATION");
    return directory;
  }
  return path.join(process.cwd(), ".media-data");
}
const statePath = () => path.join(dataDirectory(), "state.json");

async function ensureDirectory() { await mkdir(dataDirectory(), { recursive: true, mode: 0o700 }); }

async function atomicWrite(filePath: string, value: unknown) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  try {
    await rename(temporary, filePath);
    const directory = await open(path.dirname(filePath), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}

// The filesystem lock also serializes requests from separate Node workers using the same volume.
async function withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  await ensureDirectory();
  const lockPath = path.join(dataDirectory(), ".write-lock");
  const deadline = Date.now() + 8000;
  for (;;) {
    try { await mkdir(lockPath, { mode: 0o700 }); break; } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      try { if (Date.now() - (await stat(lockPath)).mtimeMs > 60_000) await rm(lockPath, { recursive: true, force: true }); } catch { /* Another worker released the lock. */ }
      if (Date.now() >= deadline) throw new MediaServerError("الحفظ مشغول مؤقتاً. حاول مرة أخرى خلال ثوانٍ.", 503, "STORAGE_BUSY");
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  try { return await operation(); } finally { await rm(lockPath, { recursive: true, force: true }); }
}

async function readStoredDocument(): Promise<StoredMediaDocument | null> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const state: unknown = JSON.parse(raw);
    if (!state || typeof state !== "object" || !("data" in state) || !("version" in state) || !Number.isSafeInteger(state.version) || Number(state.version) < 0) throw new Error("Invalid stored state");
    validateMediaData(state.data);
    const document = state as StoredMediaDocument;
    if ("authentication" in document) validateManagedAuthentication(document.authentication!, document.data);
    else if (document.data.members.some(member => member.id === "root" || String(member.role) === "superadmin")) throw new Error("Missing protected authentication storage");
    return document;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw new MediaServerError("ملف بيانات النظام يحتاج مراجعة من المسؤول. لم تتم الكتابة فوق البيانات المحفوظة.", 503, "STORAGE_INVALID");
  }
}

async function readStoredState(): Promise<VersionedMediaData | null> {
  const stored = await readStoredDocument();
  return stored ? { version: stored.version, data: stored.data } : null;
}

function validateManagedAuthentication(authentication: ManagedAuthentication, data: MediaData) {
  if (!authentication || authentication.schema !== 1 || typeof authentication.secret !== "string" || authentication.secret.length < 32 || !Array.isArray(authentication.accounts) || !authentication.accounts.length || authentication.accounts.length > 500) throw new Error("Invalid account storage");
  const ids = new Set<string>(), usernames = new Set<string>();
  for (const account of authentication.accounts) {
    if (!account || !ID_PATTERN.test(account.memberId) || !STORED_USERNAME_PATTERN.test(account.username) || account.username !== account.username.toLowerCase() || !PASSWORD_HASH_PATTERN.test(account.passwordHash) || !Number.isSafeInteger(account.authVersion) || account.authVersion < 1 || ids.has(account.memberId) || usernames.has(account.username) || !data.members.some(member => member.id === account.memberId)) throw new Error("Invalid account storage");
    ids.add(account.memberId); usernames.add(account.username);
  }
  const root = data.members.find(member => member.id === "root");
  if (root && (String(root.role) !== "superadmin" || !root.active || authentication.accounts.find(account => account.memberId === "root")?.username !== "root")) throw new Error("Invalid root account");
  if (data.members.some(member => String(member.role) === "superadmin" && member.id !== "root")) throw new Error("Invalid root account");
}

export async function readMediaState(): Promise<VersionedMediaData> {
  const existing = await readStoredState();
  if (existing) return existing;
  return withStorageLock(async () => {
    const alreadyInitialized = await readStoredState();
    if (alreadyInitialized) return alreadyInitialized;
    const data = createInitialMediaData();
    if (!(await authenticationConfiguration()).demo) { data.ideas = []; data.notifications = []; }
    const state = { version: 1, data };
    validateMediaData(state.data);
    await atomicWrite(statePath(), state);
    return state;
  });
}

async function limitedBody(request: Request, limit: number): Promise<Uint8Array> {
  const advertised = Number(request.headers.get("content-length") || 0);
  if (advertised > limit) throw new MediaServerError("حجم الطلب أكبر من الحد المسموح.", 413, "REQUEST_TOO_LARGE");
  if (!request.body) throw new MediaServerError("الطلب فارغ.");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new MediaServerError("حجم الطلب أكبر من الحد المسموح.", 413, "REQUEST_TOO_LARGE"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

export async function readJson(request: Request, maxBytes = MAX_STATE_BYTES): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new MediaServerError("يجب إرسال البيانات بصيغة JSON.", 415, "INVALID_CONTENT_TYPE");
  try { return JSON.parse(new TextDecoder().decode(await limitedBody(request, maxBytes))); } catch (error) { if (error instanceof MediaServerError) throw error; throw new MediaServerError("تعذّر قراءة البيانات. أعد تحميل الصفحة وحاول مجدداً."); }
}

type AuthAccount = { id: string; username: string; passwordHash: string; authVersion: number };
type AuthConfiguration = { demo: boolean; configured: boolean; secret: string; accounts: AuthAccount[]; managed: boolean };

async function authenticationConfiguration(): Promise<AuthConfiguration> {
  const stored = await readStoredDocument();
  if (stored?.authentication) return { demo: false, configured: true, managed: true, secret: stored.authentication.secret, accounts: stored.authentication.accounts.map(account => ({ id: account.memberId, username: account.username, passwordHash: account.passwordHash, authVersion: account.authVersion })) };
  const rawAccounts = process.env.MEDIA_AUTH_USERS;
  const secret = process.env.MEDIA_SESSION_SECRET || "";
  const hasConfiguration = Boolean(rawAccounts || secret);
  const demo = !hasConfiguration && (process.env.MEDIA_DEMO_MODE === "true" || process.env.NODE_ENV !== "production");
  if (demo) {
    await ensureDirectory();
    const filePath = path.join(dataDirectory(), "demo-session-secret");
    try { return { demo: true, configured: false, managed: false, secret: await readFile(filePath, "utf8"), accounts: [] }; } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      try { await writeFile(filePath, randomBytes(48).toString("hex"), { flag: "wx", mode: 0o600 }); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
      return { demo: true, configured: false, managed: false, secret: await readFile(filePath, "utf8"), accounts: [] };
    }
  }
  if (!hasConfiguration) return { demo: false, configured: false, managed: false, secret: "", accounts: [] };
  if (!rawAccounts || secret.length < 32) throw new MediaServerError("إعداد حسابات الدخول غير مكتمل. يجب على المسؤول ضبط الحسابات ومفتاح الجلسات.", 503, "AUTH_CONFIGURATION");
  let accounts: unknown;
  try { accounts = JSON.parse(rawAccounts); } catch { throw new MediaServerError("إعداد حسابات الدخول غير صالح. تواصل مع مسؤول النظام.", 503, "AUTH_CONFIGURATION"); }
  if (!Array.isArray(accounts) || accounts.length < 1 || accounts.length > 100 || accounts.some((a) => !a || typeof a.id !== "string" || !ID_PATTERN.test(a.id) || typeof a.passwordHash !== "string" || !PASSWORD_HASH_PATTERN.test(a.passwordHash)) || new Set(accounts.map((a) => a.id.toLowerCase())).size !== accounts.length) throw new MediaServerError("إعداد حسابات الدخول غير صالح. تواصل مع مسؤول النظام.", 503, "AUTH_CONFIGURATION");
  return { demo: false, configured: true, managed: false, secret, accounts: accounts.map(account => ({ ...account, username: account.id.toLowerCase(), authVersion: 1 })) };
}

async function passwordHash(password: string) {
  if (password.length < 6 || password.length > 256) throw new MediaServerError("أدخل كلمة مرور من ٦ إلى ٢٥٦ حرفاً.", 422, "INVALID_PASSWORD");
  const salt = randomBytes(24);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}
function authRevision(account: AuthAccount, member: TeamMember) {
  return createHash("sha256").update(JSON.stringify([account.authVersion, account.username, account.passwordHash, member.name, member.title, member.role, member.active])).digest("hex");
}

function signToken(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest("base64url"); }
function parseSession(request: Request, configuration: AuthConfiguration, data: MediaData): string | null {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !configuration.secret) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || token.length > 1024) return null;
  const expected = Buffer.from(signToken(payload, configuration.secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed.id !== "string" || !Number.isSafeInteger(parsed.expires) || parsed.expires < Date.now() || parsed.demo !== configuration.demo) return null;
    if (!configuration.demo) {
      const account = configuration.accounts.find(account => account.id === parsed.id);
      const member = data.members.find(member => member.id === parsed.id);
      if (!account || !member || parsed.revision !== authRevision(account, member)) return null;
    }
    return parsed.id;
  } catch { return null; }
}

function sessionCookie(request: Request, configuration: AuthConfiguration, memberId: string, clear = false, member?: TeamMember) {
  const account = configuration.accounts.find(account => account.id === memberId);
  const revision = account && member ? authRevision(account, member) : undefined;
  const payload = Buffer.from(JSON.stringify({ id: memberId, revision, expires: Date.now() + SESSION_SECONDS * 1000, demo: configuration.demo, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  const token = clear ? "" : `${payload}.${signToken(payload, configuration.secret)}`;
  const secure = new URL(process.env.MEDIA_APP_ORIGIN || request.url).protocol === "https:";
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export async function currentSession(request: Request, state?: VersionedMediaData) {
  const configuration = await authenticationConfiguration();
  const data = state || await readMediaState();
  const id = parseSession(request, configuration, data.data);
  const user = data.data.members.find((member) => member.active && member.id === id) || (configuration.demo ? data.data.members.find((member) => member.active && operationalAdmin(member)) : null) || null;
  return { user, demo: configuration.demo, configured: configuration.configured };
}

export async function requireUser(request: Request, state?: VersionedMediaData): Promise<TeamMember> {
  const session = await currentSession(request, state);
  if (!session.user) throw new MediaServerError(session.configured ? "يرجى تسجيل الدخول للمتابعة." : "الدخول غير مفعّل. يجب على مسؤول النظام إعداد حسابات الفريق أولاً.", 401, "AUTH_REQUIRED");
  return session.user;
}

const loginAttempts = new Map<string, { count: number; until: number }>();
export async function login(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const configuration = await authenticationConfiguration();
  const value = await readJson(request, 4096);
  const identifier = value && typeof value === "object" ? ("username" in value ? value.username : "memberId" in value ? value.memberId : undefined) : undefined;
  if (typeof identifier !== "string" || !(configuration.demo ? ID_PATTERN : STORED_USERNAME_PATTERN).test(identifier)) throw new MediaServerError("أدخل اسم مستخدم صالحاً للدخول.");
  const normalizedIdentifier = identifier.toLowerCase();
  const account = configuration.accounts.find(item => item.username === normalizedIdentifier);
  const memberId = configuration.demo ? identifier : account?.id || "__unknown";
  const state = await readMediaState();
  const user = state.data.members.find((member) => member.active && member.id === memberId);
  if (!configuration.demo) {
    if (!configuration.configured) throw new MediaServerError("الدخول غير مفعّل. تواصل مع المسؤول لإعداد حسابات الفريق.", 503, "AUTH_CONFIGURATION");
    const rateKey = configuration.accounts.some((item) => item.id === memberId) ? memberId : "__unknown";
    const attempt = loginAttempts.get(rateKey);
    if (attempt && attempt.until > Date.now() && attempt.count >= 8) throw new MediaServerError("محاولات دخول كثيرة. حاول مرة أخرى بعد ١٥ دقيقة.", 429, "LOGIN_RATE_LIMIT");
    const password = value && typeof value === "object" && "password" in value && typeof value.password === "string" ? value.password : "";
    let verified = false;
    if (password.length >= 1 && password.length <= 1024) {
      // An unknown username performs the same expensive hash comparison as a known one.
      const [, salt, expectedHex] = (account?.passwordHash || UNKNOWN_ACCOUNT_HASH).split(":");
      const actual = await scrypt(password, Buffer.from(salt, "hex"), 64) as Buffer;
      const expected = Buffer.from(expectedHex, "hex");
      verified = timingSafeEqual(actual, expected) && Boolean(account);
    }
    if (!verified || !user) {
      loginAttempts.set(rateKey, { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: attempt && attempt.until > Date.now() ? attempt.until : Date.now() + 15 * 60_000 });
      throw new MediaServerError("بيانات الدخول غير صحيحة أو الحساب غير مفعّل.", 401, "INVALID_CREDENTIALS");
    }
    loginAttempts.delete(rateKey);
  }
  if (!user) throw new MediaServerError("هذا الحساب غير مفعّل.", 403, "INACTIVE_MEMBER");
  return Response.json({ user, demo: configuration.demo, configured: configuration.configured }, { headers: { ...responseHeaders, "Set-Cookie": sessionCookie(request, configuration, user.id, false, user) } });
}

export async function logout(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const configuration = await authenticationConfiguration();
  return Response.json({ success: true }, { headers: { ...responseHeaders, "Set-Cookie": sessionCookie(request, configuration, "", true) } });
}

type AccountSummary = { memberId: string; username: string; hasPassword: boolean; protected: boolean };
function accountSummaries(data: MediaData, accounts: AuthAccount[]): AccountSummary[] {
  return data.members.map(member => ({ memberId: member.id, username: accounts.find(account => account.id === member.id)?.username || member.id, hasPassword: accounts.some(account => account.id === member.id), protected: member.id === "root" }));
}
function requireAccountAdministrator(actor: TeamMember) {
  if (!operationalAdmin(actor)) throw new MediaServerError("إدارة الحسابات متاحة لمدير النظام فقط.", 403, "ACCOUNT_PERMISSION");
}
export async function readAccounts(request: Request) {
  const state = await readMediaState();
  requireAccountAdministrator(await requireUser(request, state));
  const configuration = await authenticationConfiguration();
  return { version: state.version, accounts: accountSummaries(state.data, configuration.accounts) };
}
function normalizedUsername(value: unknown): string {
  if (typeof value !== "string" || !USERNAME_PATTERN.test(value.trim())) throw new MediaServerError("اسم المستخدم يجب أن يتكون من ٢ إلى ٦٤ حرفاً إنجليزياً أو رقماً، ويمكن استخدام النقطة والشرطة والشرطة السفلية.", 422, "INVALID_USERNAME");
  return value.trim().toLowerCase();
}
function managedFromConfiguration(configuration: AuthConfiguration): ManagedAuthentication {
  return { schema: 1, secret: configuration.secret, accounts: configuration.accounts.map(account => ({ memberId: account.id, username: account.username, passwordHash: account.passwordHash, authVersion: account.authVersion })) };
}
export async function mutateAccounts(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const submitted = await readJson(request, 16_384);
  if (!submitted || typeof submitted !== "object" || !("version" in submitted) || !Number.isSafeInteger(submitted.version) || !("operation" in submitted) || !["create", "update"].includes(String(submitted.operation))) throw new MediaServerError("بيانات الحساب غير مكتملة.", 422, "INVALID_ACCOUNT");
  return withStorageLock(async () => {
    const current = await readStoredDocument();
    if (!current) throw new MediaServerError("أعد تحميل الصفحة أولاً.", 409, "STATE_MISSING");
    const actor = await requireUser(request, current);
    requireAccountAdministrator(actor);
    if (submitted.version !== current.version) throw new MediaServerError("تم تحديث الفريق من مستخدم آخر. حمّل أحدث البيانات ثم أعد المحاولة.", 409, "VERSION_CONFLICT", { version: current.version, data: current.data });
    const configuration = await authenticationConfiguration();
    if (!configuration.configured) throw new MediaServerError("يجب تفعيل حساب root أولاً من إعداد الخادم قبل إضافة حسابات بكلمات مرور.", 409, "ROOT_SETUP_REQUIRED");
    const authentication = structuredClone(current.authentication || managedFromConfiguration(configuration));
    let data: MediaData, targetId: string;
    if (submitted.operation === "create") {
      if (!("member" in submitted) || !submitted.member || typeof submitted.member !== "object" || !("username" in submitted) || !("password" in submitted) || typeof submitted.password !== "string") throw new MediaServerError("أدخل بيانات العضو واسم المستخدم وكلمة المرور.", 422, "INVALID_ACCOUNT");
      const member = submitted.member as Record<string, unknown>;
      if (Object.keys(member).some(key => !["name", "title", "role"].includes(key)) || typeof member.name !== "string" || typeof member.title !== "string" || !["admin", "manager", "content", "designer"].includes(String(member.role))) throw new MediaServerError("اختر بيانات وصلاحية عضو صالحة.", 422, "INVALID_ACCOUNT");
      const username = normalizedUsername(submitted.username);
      if (username === "root" || authentication.accounts.some(account => account.username === username)) throw new MediaServerError("اسم المستخدم مستخدم بالفعل أو محجوز لمالك النظام.", 409, "USERNAME_EXISTS");
      data = addMediaMember(current.data, actor, member as Parameters<typeof addMediaMember>[2]);
      const added = data.members.find(candidate => !current.data.members.some(old => old.id === candidate.id));
      if (!added) throw new Error("Missing new account member");
      targetId = added.id;
      authentication.accounts.push({ memberId: targetId, username, passwordHash: await passwordHash(submitted.password), authVersion: 1 });
    } else {
      if (!("memberId" in submitted) || typeof submitted.memberId !== "string" || !("patch" in submitted) || !submitted.patch || typeof submitted.patch !== "object") throw new MediaServerError("اختر العضو والبيانات المطلوب تعديلها.", 422, "INVALID_ACCOUNT");
      targetId = submitted.memberId;
      const patch = submitted.patch as Record<string, unknown>;
      if (Object.keys(patch).some(key => !["name", "title", "role", "active"].includes(key)) || ("role" in patch && !["admin", "manager", "content", "designer"].includes(String(patch.role)) && !(targetId === "root" && patch.role === "superadmin"))) throw new MediaServerError("بيانات تعديل العضو غير صالحة.", 422, "INVALID_ACCOUNT");
      if (("name" in patch && typeof patch.name !== "string") || ("title" in patch && typeof patch.title !== "string") || ("active" in patch && typeof patch.active !== "boolean")) throw new MediaServerError("بيانات تعديل العضو غير صالحة.", 422, "INVALID_ACCOUNT");
      if (targetId === "root" && actor.id !== "root") throw new MediaServerError("حساب root محمي؛ يحرره مالك النظام فقط.", 403, "ROOT_PROTECTED");
      if (targetId === "root" && (("active" in patch && patch.active !== true) || "role" in patch)) throw new MediaServerError("لا يمكن تعطيل حساب root أو تغيير صلاحية مالك النظام.", 403, "ROOT_PROTECTED");
      const previous = current.data.members.find(member => member.id === targetId);
      if (!previous) throw new MediaServerError("العضو غير موجود.", 404, "MEMBER_NOT_FOUND");
      data = Object.keys(patch).length ? updateMediaMember(current.data, actor, targetId, patch as Parameters<typeof updateMediaMember>[3]) : structuredClone(current.data);
      let account = authentication.accounts.find(candidate => candidate.memberId === targetId);
      const username = "username" in submitted ? normalizedUsername(submitted.username) : account?.username || targetId.toLowerCase();
      if ((username === "root" && targetId !== "root") || (targetId === "root" && username !== "root") || authentication.accounts.some(candidate => candidate.username === username && candidate.memberId !== targetId)) throw new MediaServerError("اسم المستخدم مستخدم بالفعل أو محجوز لمالك النظام.", 409, "USERNAME_EXISTS");
      if ("password" in submitted && typeof submitted.password !== "string") throw new MediaServerError("أدخل كلمة مرور صالحة.", 422, "INVALID_PASSWORD");
      const changedPassword = "password" in submitted ? await passwordHash(submitted.password as string) : undefined;
      if (!account) {
        if (!changedPassword) throw new MediaServerError("هذا العضو لم يفعّل الدخول بعد. عيّن له كلمة مرور عند حفظ التعديلات.", 422, "PASSWORD_REQUIRED");
        account = { memberId: targetId, username, passwordHash: changedPassword, authVersion: 1 };
        authentication.accounts.push(account);
      } else {
        const nextMember = data.members.find(member => member.id === targetId)!;
        if (changedPassword || account.username !== username || !identical(previous, nextMember)) account.authVersion++;
        account.username = username;
        if (changedPassword) account.passwordHash = changedPassword;
      }
    }
    validateMediaData(data);
    validateManagedAuthentication(authentication, data);
    const saved = { version: current.version + 1, data };
    await atomicWrite(statePath(), { ...saved, authentication });
    const nextConfiguration: AuthConfiguration = { demo: false, configured: true, managed: true, secret: authentication.secret, accounts: authentication.accounts.map(account => ({ id: account.memberId, username: account.username, passwordHash: account.passwordHash, authVersion: account.authVersion })) };
    const liveActor = data.members.find(member => member.id === actor.id && member.active) || null;
    const reloginRequired = !liveActor || parseSession(request, nextConfiguration, data) !== actor.id;
    return Response.json({ ...saved, accounts: accountSummaries(data, nextConfiguration.accounts), currentUser: reloginRequired ? null : liveActor, reloginRequired }, { headers: { ...responseHeaders, ...(reloginRequired ? { "Set-Cookie": sessionCookie(request, nextConfiguration, "", true) } : {}) } });
  });
}

// Offline one-time bootstrap: callers supply the password through stdin, never command arguments.
export async function provisionRootAccount(password: string, name?: string) {
  await readMediaState();
  return withStorageLock(async () => {
    const current = await readStoredDocument();
    if (!current) throw new Error("Missing initialized media state");
    if (current.data.members.some(member => member.id === "root" || String(member.role) === "superadmin")) throw new MediaServerError("حساب root موجود بالفعل. غيّر بياناته من لوحة الإدارة بعد الدخول.", 409, "ROOT_EXISTS");
    const configuration = await authenticationConfiguration();
    const data = structuredClone(current.data);
    const administrator = data.members.find(member => member.role === "admin");
    const rootName = name?.trim() || administrator?.name || "مالك النظام";
    data.members.push({ id: "root", name: rootName, role: "superadmin" as TeamMember["role"], title: "قسم التصميم والإنتاج", initials: rootName.split(/\s+/).slice(0, 2).map(part => part[0]).join(""), color: "#4338ca", active: true });
    const authentication: ManagedAuthentication = current.authentication ? structuredClone(current.authentication) : { schema: 1, secret: randomBytes(48).toString("hex"), accounts: configuration.configured ? managedFromConfiguration(configuration).accounts : [] };
    authentication.accounts.push({ memberId: "root", username: "root", passwordHash: await passwordHash(password), authVersion: 1 });
    validateMediaData(data);
    validateManagedAuthentication(authentication, data);
    await atomicWrite(statePath(), { version: current.version + 1, data, authentication });
    return { username: "root", memberId: "root", version: current.version + 1, existingIdeas: data.ideas.length, existingMembers: current.data.members.length };
  });
}

type FileManifest = { attachment: Attachment; ideaId: string; ownerId: string; inlineMime: string | null; purpose?: "logo" };
const fileDirectory = () => path.join(dataDirectory(), "files");
const manifestPath = (id: string) => path.join(fileDirectory(), `${id}.json`);

async function readManifest(id: string): Promise<FileManifest | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  try { return JSON.parse(await readFile(manifestPath(id), "utf8")) as FileManifest; } catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return null; throw error; }
}

function identical(a: unknown, b: unknown) {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
async function validateStoredAttachments(previous: MediaData, next: MediaData, actor: TeamMember) {
  const existing = new Map(previous.ideas.flatMap((idea) => idea.attachments.map((attachment) => [attachment.id, { attachment, ideaId: idea.id }] as const)));
  const seen = new Set<string>();
  for (const idea of next.ideas) for (const attachment of idea.attachments) {
    if (seen.has(attachment.id)) throw new MediaServerError("لا يمكن ربط المرفق بأكثر من فكرة.", 422, "DUPLICATE_ATTACHMENT");
    seen.add(attachment.id);
    const old = existing.get(attachment.id);
    if (old && old.ideaId === idea.id && identical(old.attachment, attachment)) continue;
    const manifest = await readManifest(attachment.id);
    if (!manifest || manifest.ideaId !== idea.id || !identical(manifest.attachment, attachment) || (manifest.ownerId !== actor.id && !operationalAdmin(actor))) throw new MediaServerError("هذا المرفق غير صالح أو لم يتم رفعه من حسابك. ارفع الملف مجدداً.", 422, "INVALID_ATTACHMENT");
  }
  if (next.settings.logoUrl !== previous.settings.logoUrl && next.settings.logoUrl && next.settings.logoUrl !== "/assets/media/department-logo.png") {
    const logoId = /^\/api\/files\/([a-f0-9-]{36})\?inline=1$/.exec(next.settings.logoUrl)?.[1];
    const logo = logoId ? await readManifest(logoId) : null;
    if (!logo || logo.purpose !== "logo" || logo.ownerId !== actor.id || !logo.inlineMime?.startsWith("image/") || logo.attachment.url !== next.settings.logoUrl) throw new MediaServerError("اختر شعاراً تم رفعه من إدارة النظام. ارفع الصورة مجدداً ثم احفظ الإعدادات.", 422, "INVALID_LOGO");
  }
}

export async function saveMediaState(request: Request): Promise<VersionedMediaData> {
  assertSameOrigin(request);
  const submitted = await readJson(request);
  if (!submitted || typeof submitted !== "object" || !("version" in submitted) || !Number.isSafeInteger(submitted.version) || !("data" in submitted)) throw new MediaServerError("بيانات الحفظ غير مكتملة. أعد تحميل الصفحة.");
  validateMediaData(submitted.data);
  const next = submitted.data;
  return withStorageLock(async () => {
    const current = await readStoredDocument();
    if (!current) throw new MediaServerError("أعد تحميل الصفحة لإنشاء بيانات النظام.", 409, "STATE_MISSING");
    const actor = await requireUser(request, current);
    if (submitted.version !== current.version) throw new MediaServerError("تم تحديث البيانات من مستخدم آخر. حمّل النسخة الأحدث ثم أعد المحاولة.", 409, "VERSION_CONFLICT", { version: current.version, data: current.data });
    if (current.authentication && !identical(current.data.members, next.members)) throw new MediaServerError("تعديل الحسابات متاح من لوحة الفريق والصلاحيات فقط، حتى تُحفظ كلمات المرور والصلاحيات معاً.", 403, "ACCOUNTS_API_REQUIRED");
    validateMediaMutation(current.data, next, actor);
    await validateStoredAttachments(current.data, next, actor);
    const saved = { version: current.version + 1, data: next };
    await atomicWrite(statePath(), { ...saved, ...(current.authentication ? { authentication: current.authentication } : {}) });
    return saved;
  });
}

function inlineMime(bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, 16));
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (head[0] === 255 && head[1] === 216 && head[2] === 255) return "image/jpeg";
  if (head.subarray(0, 6).toString() === "GIF87a" || head.subarray(0, 6).toString() === "GIF89a") return "image/gif";
  if (head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (head.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (head.subarray(4, 8).toString() === "ftyp") {
    const brand = head.subarray(8, 12).toString();
    if (["avif", "avis"].includes(brand)) return "image/avif";
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(brand)) return "video/mp4";
  }
  return null;
}

function safeFilename(name: string) { return path.basename(name.replaceAll("\\", "/")).replace(/[\u0000-\u001f\u007f]/g, "").replace(/[<>:"|?*]/g, "_").slice(0, 240).trim() || "مرفق"; }

export async function uploadFiles(request: Request): Promise<Attachment[]> {
  assertSameOrigin(request);
  const state = await readMediaState();
  const actor = await requireUser(request, state);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) throw new MediaServerError("اختر الملفات لإرفاقها.", 415, "INVALID_CONTENT_TYPE");
  const body = await limitedBody(request, UPLOAD_LIMIT + 1024 * 1024);
  let form: FormData;
  try { form = await new Response(body as BodyInit, { headers: { "Content-Type": contentType } }).formData(); } catch { throw new MediaServerError("تعذّر قراءة الملفات. اخترها مجدداً."); }
  const ideaId = form.get("ideaId");
  const kind = form.get("kind");
  const channel = form.get("channel");
  const isLogo = kind === "logo";
  if ((!isLogo && (typeof ideaId !== "string" || !ID_PATTERN.test(ideaId))) || !["brief", "quotation", "final", "logo"].includes(String(kind)) || (channel && !["screens", "whatsapp", "email"].includes(String(channel))) || (kind !== "final" && channel)) throw new MediaServerError("بيانات المرفق غير مكتملة.");
  const idea = state.data.ideas.find((item) => item.id === ideaId);
  if (isLogo) {
    if (!operationalAdmin(actor)) throw new MediaServerError("تغيير شعار الإدارة متاح لمدير النظام فقط.", 403, "FILE_PERMISSION");
  } else if (kind === "final") {
    if (!idea || !["scheduled", "designing", "design_review"].includes(idea.status) || !channel || !idea.channels.includes(channel as NonNullable<Attachment["channel"]>) || (!operationalAdmin(actor) && (actor.role !== "designer" || idea.designerId !== actor.id))) throw new MediaServerError("إرفاق النسخ النهائية متاح للمصمم المكلّف بعد جدولة الفكرة، وللقنوات المطلوبة فقط.", 403, "FILE_PERMISSION");
  } else if ((idea && !["draft", "quotations", "changes"].includes(idea.status)) || (!operationalAdmin(actor) && (actor.role !== "content" || (idea && idea.ownerId !== actor.id)))) throw new MediaServerError("إضافة مرفقات المحتوى متاحة لمسؤول الفكرة أثناء إعدادها أو تعديلها.", 403, "FILE_PERMISSION");
  const files = form.getAll("files");
  if (files.length < 1 || files.length > (isLogo ? 1 : 10) || files.some((file) => typeof file === "string")) throw new MediaServerError(isLogo ? "اختر صورة شعار واحدة." : "يمكن إرفاق من ملف واحد إلى ١٠ ملفات في كل مرة.");
  let total = 0;
  for (const file of files as File[]) { total += file.size; if (file.size === 0 || file.size > (isLogo ? 5 * 1024 * 1024 : FILE_LIMIT)) throw new MediaServerError(isLogo ? "يجب ألا يتجاوز حجم الشعار ٥ ميجابايت، وألا يكون فارغاً." : "يجب ألا يتجاوز حجم كل ملف ٢٥ ميجابايت، وألا يكون فارغاً.", 413, "FILE_TOO_LARGE"); }
  if (total > UPLOAD_LIMIT) throw new MediaServerError("الحد الإجمالي لملفات الدفعة هو ١٠٠ ميجابايت.", 413, "UPLOAD_TOO_LARGE");
  await mkdir(fileDirectory(), { recursive: true, mode: 0o700 });
  const attachments: Attachment[] = [];
  const createdIds: string[] = [];
  try {
    for (const file of files as File[]) {
      const id = randomUUID();
      createdIds.push(id);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = inlineMime(bytes);
      if (isLogo && !detected?.startsWith("image/")) throw new MediaServerError("اختر شعاراً بصيغة PNG أو JPEG أو GIF أو WebP أو AVIF.", 422, "INVALID_LOGO_TYPE");
      const attachment: Attachment = { id, name: safeFilename(file.name), size: file.size, mime: detected || "application/octet-stream", url: `/api/files/${id}${isLogo ? "?inline=1" : ""}`, kind: isLogo ? "brief" : kind as Attachment["kind"], ...(channel ? { channel: channel as Attachment["channel"] } : {}), createdAt: new Date().toISOString() };
      await writeFile(path.join(fileDirectory(), `${id}.blob`), bytes, { flag: "wx", mode: 0o600 });
      await atomicWrite(manifestPath(id), { attachment, ideaId: isLogo ? "__system_logo" : String(ideaId), ownerId: actor.id, inlineMime: detected, ...(isLogo ? { purpose: "logo" as const } : {}) } satisfies FileManifest);
      attachments.push(attachment);
    }
    return attachments;
  } catch (error) {
    await Promise.all(createdIds.flatMap((id) => [rm(path.join(fileDirectory(), `${id}.blob`), { force: true }), rm(manifestPath(id), { force: true })]));
    throw error;
  }
}

export async function downloadFile(request: Request, id: string): Promise<Response> {
  const state = await readMediaState();
  const actor = await requireUser(request, state);
  const manifest = await readManifest(id);
  if (!manifest) throw new MediaServerError("الملف غير موجود.", 404, "FILE_NOT_FOUND");
  const attached = state.data.ideas.some((idea) => idea.id === manifest.ideaId && idea.attachments.some((attachment) => attachment.id === id));
  if (!attached && manifest.purpose !== "logo" && manifest.ownerId !== actor.id && !operationalAdmin(actor)) throw new MediaServerError("ليس لديك صلاحية الوصول لهذا الملف.", 403, "FILE_PERMISSION");
  let bytes: Buffer;
  try { bytes = await readFile(path.join(fileDirectory(), `${id}.blob`)); } catch { throw new MediaServerError("تعذّر العثور على الملف المحفوظ. تواصل مع المسؤول.", 404, "FILE_NOT_FOUND"); }
  const inline = new URL(request.url).searchParams.get("inline") === "1" && Boolean(manifest.inlineMime);
  const name = encodeURIComponent(manifest.attachment.name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(bytes), { headers: { ...responseHeaders, "Content-Type": inline ? manifest.inlineMime! : "application/octet-stream", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="attachment"; filename*=UTF-8''${name}`, "Content-Length": String(bytes.length), "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } });
}

type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string; size?: string; webViewLink?: string; thumbnailLink?: string };
const driveTokens = new Map<string, { value: string; expires: number }>();
const DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";
const DRIVE_WRITE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const tokenKey = (email: string, key: string, scope: string) => `${email}:${scope}:${createHash("sha256").update(key).digest("hex")}`;
async function googleAccessToken(email: string, privateKey: string, scope = DRIVE_READ_SCOPE): Promise<string> {
  const cacheKey = tokenKey(email, privateKey, scope);
  const cached = driveTokens.get(cacheKey);
  if (cached && cached.expires > Date.now() + 60_000) return cached.value;
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })).toString("base64url");
  const unsigned = `${head}.${claims}`;
  let signature: string;
  try { signature = createSign("RSA-SHA256").update(unsigned).end().sign(privateKey.replace(/\\n/g, "\n"), "base64url"); } catch { throw new MediaServerError("مفتاح حساب Google Drive غير صالح. راجع إعدادات الخادم.", 503, "DRIVE_CONFIGURATION"); }
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !result.access_token) throw new MediaServerError("تعذّر توثيق حساب Google Drive. راجع الحساب والمفتاح وتفعيل Drive API.", 502, "DRIVE_AUTHENTICATION");
  driveTokens.set(cacheKey, { value: result.access_token, expires: Date.now() + (result.expires_in || 3600) * 1000 });
  return result.access_token;
}

export async function listDriveFiles(request: Request) {
  const state = await readMediaState();
  await requireUser(request, state);
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const folder = state.data.settings.driveFolderId;
  if (!email || !key || !folder) return { configured: false, files: [], message: "لم يتم ربط Google Drive. يحدد المسؤول مجلد الأرشيف ويضبط حساب الخدمة في إعدادات الخادم." };
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(folder)) throw new MediaServerError("معرّف مجلد Google Drive غير صالح. حدّثه من إدارة النظام.", 422, "DRIVE_FOLDER_INVALID");
  const date = new URL(request.url).searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+03:00`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new MediaServerError("اختر تاريخاً صالحاً لعرض الأرشيف.", 422, "INVALID_DATE");
  const start = new Date(`${date}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const token = await googleAccessToken(email, key);
  const files: DriveFile[] = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ q: `'${folder}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and modifiedTime >= '${start.toISOString()}' and modifiedTime < '${end.toISOString()}'`, fields: "nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,size,webViewLink,thumbnailLink)", pageSize: "100", orderBy: "modifiedTime desc", supportsAllDrives: "true", includeItemsFromAllDrives: "true", ...(pageToken ? { pageToken } : {}) });
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) { if (response.status === 401) driveTokens.delete(tokenKey(email, key, DRIVE_READ_SCOPE)); throw new MediaServerError(response.status === 403 || response.status === 404 ? "تعذّر فتح مجلد الأرشيف. شارك المجلد مع حساب الخدمة وتأكد من تفعيل Drive API." : "تعذّر تحميل الأرشيف من Google Drive. حاول مجدداً.", 502, "DRIVE_UNAVAILABLE"); }
    const result = await response.json() as { files?: DriveFile[]; nextPageToken?: string; incompleteSearch?: boolean };
    if (!Array.isArray(result.files)) throw new MediaServerError("استجابة Google Drive غير مكتملة. حاول مجدداً.", 502, "DRIVE_UNAVAILABLE");
    files.push(...result.files);
    pageToken = result.nextPageToken || "";
    if (!pageToken) return { configured: true, files, date, ...(result.incompleteSearch ? { message: "قد تكون نتائج البحث غير مكتملة لدى Google Drive." } : {}) };
  }
  return { configured: true, files, date, message: "تم عرض أول ٢٠٠٠ ملف لهذا اليوم. قسّم الأرشيف إلى مجلدات أصغر لعرض جميع الملفات." };
}

type DriveArchiveFile = { id: string; name: string; webViewLink: string };
type DriveArchiveEntry = { attachmentId: string; folderId: string; ideaId: string; fileId: string; name: string; sha256: string; createdAt: string; completedAt?: string; webViewLink?: string };
type DriveArchiveJournal = { version: 1; entries: Record<string, DriveArchiveEntry> };
const archiveJournalPath = () => path.join(dataDirectory(), "drive-archive.json");
const archiveKey = (attachmentId: string, folder: string) => createHash("sha256").update(`${folder}\n${attachmentId}`).digest("hex");

async function readArchiveJournal(): Promise<DriveArchiveJournal> {
  try {
    const result: unknown = JSON.parse(await readFile(archiveJournalPath(), "utf8"));
    if (!result || typeof result !== "object" || !("version" in result) || result.version !== 1 || !("entries" in result) || !result.entries || typeof result.entries !== "object" || Array.isArray(result.entries)) throw new Error("Invalid archive journal");
    for (const [key, entry] of Object.entries(result.entries)) {
      if (!/^[a-f0-9]{64}$/.test(key) || !entry || typeof entry !== "object" || !/^[A-Za-z0-9_-]{5,200}$/.test(entry.fileId) || typeof entry.attachmentId !== "string" || typeof entry.folderId !== "string" || typeof entry.ideaId !== "string" || typeof entry.name !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) || typeof entry.createdAt !== "string" || (entry.completedAt !== undefined && typeof entry.completedAt !== "string")) throw new Error("Invalid archive entry");
    }
    return result as DriveArchiveJournal;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { version: 1, entries: {} };
    throw new MediaServerError("سجل أرشفة Google Drive يحتاج مراجعة المسؤول. لم تتم إعادة رفع الملفات لتجنب تكرارها.", 503, "DRIVE_JOURNAL_INVALID");
  }
}

async function writeArchiveEntry(key: string, entry: DriveArchiveEntry) {
  await withStorageLock(async () => {
    const journal = await readArchiveJournal();
    journal.entries[key] = entry;
    await atomicWrite(archiveJournalPath(), journal);
  });
}

async function withArchiveLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const lock = path.join(dataDirectory(), `.drive-lock-${key}`);
  await ensureDirectory();
  try { await mkdir(lock, { mode: 0o700 }); } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    if (Date.now() - (await stat(lock)).mtimeMs < 120_000) throw new MediaServerError("أرشفة هذه الفكرة قيد التنفيذ. انتظر اكتمالها ثم حدّث الأرشيف.", 409, "DRIVE_ARCHIVE_BUSY");
    await rm(lock, { recursive: true, force: true });
    try { await mkdir(lock, { mode: 0o700 }); } catch { throw new MediaServerError("أرشفة هذه الفكرة قيد التنفيذ. حاول مرة أخرى بعد اكتمالها.", 409, "DRIVE_ARCHIVE_BUSY"); }
  }
  const heartbeat = setInterval(() => { const at = new Date(); void utimes(lock, at, at).catch(() => {}); }, 10_000);
  heartbeat.unref();
  try { return await operation(); } finally { clearInterval(heartbeat); await rm(lock, { recursive: true, force: true }); }
}

async function driveArchiveError(response: Response): Promise<MediaServerError> {
  let reason = "";
  try {
    const result = await response.json() as { error?: { errors?: { reason?: string }[] } };
    reason = result.error?.errors?.[0]?.reason || "";
  } catch { /* Do not expose third-party error bodies. */ }
  if (reason === "storageQuotaExceeded") return new MediaServerError("تعذّر الرفع بسبب مساحة Google Drive. حساب الخدمة يحتاج مجلداً في Shared Drive بصلاحية الكتابة؛ راجع المجلد والمساحة مع المسؤول.", 502, "DRIVE_STORAGE_QUOTA");
  if (response.status === 403 || response.status === 404) return new MediaServerError("تعذّرت أرشفة الملف. تأكد أن المجلد مشترك مع حساب الخدمة بصلاحية الكتابة، وأن Drive API مفعّل.", 502, "DRIVE_WRITE_PERMISSION");
  if (response.status === 401) return new MediaServerError("انتهى توثيق Google Drive. أعد محاولة الأرشفة؛ الملفات المكتملة لن تتكرر.", 502, "DRIVE_AUTHENTICATION");
  if (response.status === 409) return new MediaServerError("أعاد Google Drive تعارضاً أثناء الرفع. أعد المحاولة للتحقق من الملف المحفوظ دون إنشاء نسخة ثانية.", 502, "DRIVE_UPLOAD_CONFLICT");
  return new MediaServerError("تعذّر رفع الملف إلى Google Drive. أعد المحاولة لاستكمال الملفات المتبقية دون تكرار المكتمل.", 502, "DRIVE_UPLOAD_FAILED");
}

function driveFileLink(id: string, link?: string): string {
  if (link) { try { const url = new URL(link); if (url.protocol === "https:" && ["drive.google.com", "docs.google.com"].includes(url.hostname)) return link; } catch { /* Use the verified file ID below. */ } }
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

async function lookupArchivedFile(entry: DriveArchiveEntry, key: string, token: string): Promise<DriveArchiveFile | null> {
  const params = new URLSearchParams({ fields: "id,name,webViewLink,parents,appProperties,trashed,sha256Checksum", supportsAllDrives: "true" });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${entry.fileId}?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw await driveArchiveError(response);
  const file = await response.json() as { id?: string; name?: string; webViewLink?: string; parents?: string[]; appProperties?: Record<string, string>; trashed?: boolean; sha256Checksum?: string };
  if (file.id !== entry.fileId || file.trashed || !file.parents?.includes(entry.folderId) || file.appProperties?.internalCommsArchiveKey !== key || (file.sha256Checksum && file.sha256Checksum !== entry.sha256)) throw new MediaServerError("الملف المؤرشف على Google Drive تغيّر أو نُقل من المجلد. راجع المسؤول قبل إعادة الرفع لتجنب تكرار النسخ.", 409, "DRIVE_ARCHIVE_CHANGED");
  return { id: file.id, name: file.name || entry.name, webViewLink: driveFileLink(file.id, file.webViewLink) };
}

async function uploadArchivedFile(entry: DriveArchiveEntry, key: string, attachment: Attachment, bytes: Uint8Array, token: string): Promise<DriveArchiveFile> {
  const params = new URLSearchParams({ uploadType: "resumable", supportsAllDrives: "true", fields: "id,name,webViewLink" });
  const metadata = { id: entry.fileId, name: entry.name, parents: [entry.folderId], mimeType: attachment.mime, appProperties: { internalCommsArchiveKey: key, internalCommsIdeaId: entry.ideaId, internalCommsAttachmentId: attachment.id } };
  const initiation = await fetch(`https://www.googleapis.com/upload/drive/v3/files?${params}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": attachment.mime, "X-Upload-Content-Length": String(bytes.length) }, body: JSON.stringify(metadata), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!initiation.ok) {
    if (initiation.status === 409) { const recovered = await lookupArchivedFile(entry, key, token); if (recovered) return recovered; }
    throw await driveArchiveError(initiation);
  }
  const location = initiation.headers.get("location");
  if (!location) throw new MediaServerError("لم يُعد Google Drive رابط الرفع. أعد المحاولة؛ معرّف الملف محفوظ لمنع التكرار.", 502, "DRIVE_UPLOAD_FAILED");
  const target = new URL(location);
  if (target.protocol !== "https:" || target.hostname !== "www.googleapis.com" || !target.pathname.startsWith("/upload/drive/")) throw new MediaServerError("تعذّر التحقق من رابط رفع Google Drive. أوقف الرفع وراجع المسؤول.", 502, "DRIVE_UPLOAD_FAILED");
  const uploaded = await fetch(target, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": attachment.mime, "Content-Length": String(bytes.length) }, body: bytes as BodyInit, cache: "no-store", signal: AbortSignal.timeout(90_000) });
  if (!uploaded.ok) {
    if (uploaded.status === 409) { const recovered = await lookupArchivedFile(entry, key, token); if (recovered) return recovered; }
    throw await driveArchiveError(uploaded);
  }
  const result = await uploaded.json() as { id?: string; name?: string; webViewLink?: string };
  if (result.id !== entry.fileId) throw new MediaServerError("استجابة أرشفة Google Drive غير مكتملة. أعد المحاولة للتحقق من الملف المحفوظ.", 502, "DRIVE_UPLOAD_FAILED");
  return { id: result.id, name: result.name || entry.name, webViewLink: driveFileLink(result.id, result.webViewLink) };
}

/** Uploading is an explicit optional action. Browsing never requests write scopes. */
export async function archiveDriveFiles(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const state = await readMediaState();
  const actor = await requireUser(request, state);
  const submitted = await readJson(request, 4096);
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted) || Object.keys(submitted).some((key) => key !== "ideaId") || !("ideaId" in submitted) || typeof submitted.ideaId !== "string" || !ID_PATTERN.test(submitted.ideaId)) throw new MediaServerError("حدد الفكرة التي تريد أرشفتها.");
  const idea = state.data.ideas.find((item) => item.id === submitted.ideaId);
  if (!idea) throw new MediaServerError("لم يتم العثور على الفكرة.", 404, "NOT_FOUND");
  if (!operationalAdmin(actor) && (actor.role !== "designer" || idea.designerId !== actor.id)) throw new MediaServerError("أرشفة النسخ النهائية متاحة لمدير النظام أو المصمم المكلّف فقط.", 403, "DRIVE_ARCHIVE_PERMISSION");
  if (idea.status !== "delivered") throw new MediaServerError("أكمل مراجعة التصميم وتسليم العمل قبل أرشفته على Google Drive.", 422, "DRIVE_NOT_DELIVERED");
  const finals = idea.attachments.filter((file) => file.kind === "final");
  if (!finals.length || idea.channels.some((channel) => !finals.some((file) => file.channel === channel))) throw new MediaServerError("أرفق النسخ النهائية لكل قناة مطلوبة قبل الأرشفة.", 422, "MISSING_DELIVERABLES");
  // Validate every source before the first external write. Demo URLs are never exported.
  for (const file of finals) {
    const manifest = await readManifest(file.id);
    if (!manifest) throw new MediaServerError("الأرشفة تحتاج ملفات نهائية فعلية محفوظة على الخادم. نماذج التجربة والروابط الخارجية لا تُرفع إلى Google Drive.", 422, "UNSTORED_DELIVERABLE");
    let size = -1;
    try { size = (await stat(path.join(fileDirectory(), `${file.id}.blob`))).size; } catch { /* Missing physical source. */ }
    if (!manifest || manifest.ideaId !== idea.id || !identical(manifest.attachment, file) || manifest.purpose || size !== file.size || size < 1 || size > FILE_LIMIT) throw new MediaServerError("الأرشفة تحتاج ملفات نهائية فعلية محفوظة على الخادم. نماذج التجربة والروابط الخارجية لا تُرفع إلى Google Drive.", 422, "UNSTORED_DELIVERABLE");
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const folder = state.data.settings.driveFolderId;
  if (!email || !privateKey || !folder) return Response.json({ configured: false, error: "لم يتم ربط Google Drive. يحدد المسؤول مجلد الأرشيف ويضبط حساب الخدمة بصلاحية الكتابة أولاً.", code: "DRIVE_NOT_CONFIGURED", files: [], alreadyArchivedCount: 0 }, { status: 503, headers: responseHeaders });
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(folder)) throw new MediaServerError("معرّف مجلد Google Drive غير صالح.", 422, "DRIVE_FOLDER_INVALID");
  return withArchiveLock(createHash("sha256").update(`${folder}\n${idea.id}`).digest("hex"), async () => {
    const files: DriveArchiveFile[] = [];
    const completedAttachmentIds = new Set<string>();
    let alreadyArchivedCount = 0;
    let index = 0;
    try {
      const token = await googleAccessToken(email, privateKey, DRIVE_WRITE_SCOPE);
      for (; index < finals.length; index++) {
        const attachment = finals[index];
        const key = archiveKey(attachment.id, folder);
        const bytes = new Uint8Array(await readFile(path.join(fileDirectory(), `${attachment.id}.blob`)));
        const digest = createHash("sha256").update(bytes).digest("hex");
        let entry = (await readArchiveJournal()).entries[key];
        if (entry) {
          if (entry.attachmentId !== attachment.id || entry.folderId !== folder || entry.ideaId !== idea.id || entry.sha256 !== digest) throw new MediaServerError("تغيّر الملف أو سجل الأرشفة. راجع المسؤول قبل إعادة رفعه.", 409, "DRIVE_ARCHIVE_CHANGED");
          const existing = await lookupArchivedFile(entry, key, token);
          if (existing) { files.push(existing); completedAttachmentIds.add(attachment.id); alreadyArchivedCount++; if (!entry.completedAt) await writeArchiveEntry(key, { ...entry, completedAt: new Date().toISOString(), webViewLink: existing.webViewLink }); continue; }
          if (entry.completedAt) throw new MediaServerError("الملف الذي سبق أرشفته لم يعد متاحاً في Google Drive. راجع الحذف أو صلاحيات الوصول قبل إنشاء نسخة جديدة.", 409, "DRIVE_ARCHIVE_CHANGED");
        } else {
          const idsResponse = await fetch("https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
          if (!idsResponse.ok) throw await driveArchiveError(idsResponse);
          const ids = await idsResponse.json() as { ids?: string[] };
          const fileId = ids.ids?.[0];
          if (!fileId || !/^[A-Za-z0-9_-]{5,200}$/.test(fileId)) throw new MediaServerError("تعذّر حجز معرّف ملف في Google Drive. حاول مجدداً.", 502, "DRIVE_UPLOAD_FAILED");
          entry = { attachmentId: attachment.id, folderId: folder, ideaId: idea.id, fileId, name: safeFilename(`${idea.code} - ${attachment.name}`), sha256: digest, createdAt: new Date().toISOString() };
          await writeArchiveEntry(key, entry);
        }
        const archived = await uploadArchivedFile(entry, key, attachment, bytes, token);
        // Include completed remote work even if the following local journal write fails.
        files.push(archived);
        completedAttachmentIds.add(attachment.id);
        await writeArchiveEntry(key, { ...entry, completedAt: new Date().toISOString(), webViewLink: archived.webViewLink });
      }
      return Response.json({ configured: true, files, alreadyArchivedCount }, { headers: responseHeaders });
    } catch (error) {
      driveTokens.delete(tokenKey(email, privateKey, DRIVE_WRITE_SCOPE));
      const failure = error instanceof MediaServerError ? error : new MediaServerError("انقطع الاتصال أثناء الأرشفة. أعد المحاولة لاستكمال الملفات؛ معرّفاتها محفوظة لمنع تكرار النسخ.", 502, "DRIVE_UPLOAD_INTERRUPTED");
      const remainingAttachmentIds = finals.filter((file) => !completedAttachmentIds.has(file.id)).map((file) => file.id);
      return Response.json({ configured: true, error: failure.message, code: failure.code, files, alreadyArchivedCount, remainingAttachmentIds }, { status: failure.status, headers: responseHeaders });
    }
  });
}
