/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads transpiled TypeScript through CommonJS. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHarness, PASSWORDS } = require("./helpers/harness.cjs");

let h, auth, totp, scheduler, files;
const login = (username, extra = {}, ip = "10.1.1.1") => auth.login(h.jsonRequest("/api/session", { username, password: PASSWORDS[username], ...extra }, { ip }));
const mfa = (who, body) => auth.mfaAction(h.jsonRequest("/api/account/mfa", body, { cookie: h.cookies[who] }));
const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];

before(async () => {
  h = await createHarness();
  auth = require(path.join(h.root, "lib/server/auth.ts"));
  totp = require(path.join(h.root, "lib/server/totp.ts"));
  scheduler = require(path.join(h.root, "lib/server/scheduler.ts"));
  files = require(path.join(h.root, "lib/server/files.ts"));
});
after(async () => { delete process.env.WASL_REQUIRE_ADMIN_MFA; await h.close(); });

test("TOTP codes follow RFC 6238 test vectors", () => {
  const secret = totp.base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(totp.codeAt(secret, Math.floor(59 / 30)), "287082");
  assert.equal(totp.codeAt(secret, Math.floor(1111111109 / 30)), "081804");
});

test("two-factor sign-in: enroll, require the code, and refuse a replayed code (M6)", async () => {
  const started = await mfa("sara", { action: "start" });
  assert.match(started.qr, /^data:image\/png;base64,/);
  const step = Math.floor(Date.now() / 30_000);
  await assert.rejects(mfa("sara", { action: "confirm", code: "000000" }), (error) => error.code === "INVALID_MFA");
  await mfa("sara", { action: "confirm", code: totp.codeAt(started.secret, step) });
  await assert.rejects(login("sara"), (error) => error.code === "MFA_REQUIRED");
  await assert.rejects(login("sara", { code: totp.codeAt(started.secret, step) }), (error) => error.code === "INVALID_MFA");
  const ok = await login("sara", { code: totp.codeAt(started.secret, step + 1) }, "10.1.1.2");
  assert.equal(ok.status, 200);
  const stored = (await h.pg.query("select totp_secret_enc from wasl.accounts where member_id = 'sara'")).rows[0].totp_secret_enc;
  assert.ok(!stored.includes(started.secret));
});

test("when required, administrators must enable two-factor before admin tools work (M6)", async () => {
  process.env.WASL_REQUIRE_ADMIN_MFA = "true";
  await assert.rejects(h.op("admin", { type: "addCategory", name: "تصنيف جديد" }), (error) => error.code === "MFA_SETUP_REQUIRED");
  const session = await auth.currentSession(h.getRequest("/api/session", h.cookies.admin));
  assert.deepEqual(session.mfa, { enabled: false, required: true });
  const started = await mfa("admin", { action: "start" });
  await mfa("admin", { action: "confirm", code: totp.codeAt(started.secret, Math.floor(Date.now() / 30_000)) });
  const fresh = cookieOf(await login("admin", { code: totp.codeAt(started.secret, Math.floor(Date.now() / 30_000) + 1) }, "10.1.1.3"));
  const result = await require(path.join(h.root, "lib/server/ops.ts")).runOperation(h.jsonRequest("/api/ops", { type: "addCategory", name: "تصنيف جديد" }, { cookie: fresh }));
  assert.ok(result.categories.some((category) => category.name === "تصنيف جديد"));
  await assert.rejects(auth.mfaAction(h.jsonRequest("/api/account/mfa", { action: "disable", code: "123456" }, { cookie: fresh })), (error) => error.code === "MFA_REQUIRED_FOR_ADMINS");
  delete process.env.WASL_REQUIRE_ADMIN_MFA;
});

test("files uploaded but never attached are removed after a day (M7)", async () => {
  const form = new FormData();
  form.append("ideaId", "idea-008"); form.append("kind", "brief"); form.append("files", new Blob(["temporary"]), "temp.txt");
  const [uploaded] = await files.uploadFiles(new Request(`${h.ORIGIN}/api/files`, { method: "POST", headers: { cookie: h.cookies.noura, origin: h.ORIGIN }, body: form }));
  assert.equal((await scheduler.cleanupFiles(h.database)).orphans, 0);
  await h.pg.query("update wasl.attachments set created_at = now() - interval '25 hours' where id = $1", [uploaded.id]);
  assert.equal((await scheduler.cleanupFiles(h.database)).orphans, 1);
  assert.equal((await h.pg.query("select count(*)::int as n from wasl.attachments where id = $1", [uploaded.id])).rows[0].n, 0);
});

test("server-side uploads before Drive is connected are capped to fit serverless limits (M8)", async () => {
  const form = new FormData();
  form.append("ideaId", "idea-008"); form.append("kind", "brief"); form.append("files", new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)]), "big.bin");
  await assert.rejects(files.uploadFiles(new Request(`${h.ORIGIN}/api/files`, { method: "POST", headers: { cookie: h.cookies.noura, origin: h.ORIGIN }, body: form })), (error) => error.status === 413);
});
