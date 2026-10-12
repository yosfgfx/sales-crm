import { createHash, createHmac, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DB_URL, ORIGIN, pageAs, projectContext, signIn } from "./helpers";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32 = (bytes: Buffer) => { let bits = "", out = ""; for (const byte of bytes) bits += byte.toString(2).padStart(8, "0"); for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)]; return out; };
const unbase32 = (text: string) => { let bits = ""; for (const char of text) bits += ALPHABET.indexOf(char).toString(2).padStart(5, "0"); return Buffer.from(bits.match(/.{8}/g)!.map((chunk) => parseInt(chunk, 2))); };
function code(secret: string, offset = 0) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const hmac = createHmac("sha1", unbase32(secret)).update(counter).digest();
  const value = (hmac.readUInt32BE(hmac[hmac.length - 1] & 15) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

test.afterAll(async () => {
  const db = new Client({ connectionString: E2E_DB_URL });
  await db.connect();
  await db.query("update wasl.accounts set totp_secret_enc = null, totp_last_step = null where member_id = 'admin'");
  await db.end();
});

test("an administrator creates a key and approves an MCP app through the sign-in page; members never see it", async ({ browser, request }, info) => {
  test.skip(info.project.name !== "desktop", "Shares one authenticator step sequence across the run.");
  const noura = await pageAs(browser, "noura");
  await noura.getByRole("button", { name: "إعدادات الحساب" }).click();
  await expect(noura.getByRole("dialog")).toBeVisible();
  await expect(noura.getByText("الوصول البرمجي وMCP")).toHaveCount(0);

  const admin = await pageAs(browser, "admin");
  const consent = await (await browser.newContext(projectContext())).newPage();
  await signIn(consent, "admin");
  const secret = base32(randomBytes(20));
  process.env.WASL_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  const encrypt = await import("../lib/server/crypto");
  const db = new Client({ connectionString: E2E_DB_URL });
  await db.connect();
  await db.query("update wasl.accounts set totp_secret_enc = $2, totp_last_step = null where member_id = $1", ["admin", encrypt.encryptSecret(secret)]);
  await db.end();
  const menu = admin.getByRole("button", { name: "فتح القائمة الرئيسية" });
  if (await menu.isVisible()) await menu.click();
  await admin.getByRole("button", { name: "إدارة النظام" }).click();
  await admin.getByRole("tab", { name: "API وMCP" }).click();
  await expect(admin.getByRole("heading", { name: "الوصول البرمجي وMCP" })).toBeVisible();
  const axe = await new AxeBuilder({ page: admin as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);
  await admin.getByLabel("اسم المفتاح").fill("Claude Code");
  await admin.getByLabel("رمز التحقق").fill(code(secret, -1));
  await admin.getByRole("button", { name: "إنشاء مفتاح" }).click();
  const token = (await admin.locator("code").filter({ hasText: /^wasl_/ }).textContent())!.trim();
  expect(token).toMatch(/^wasl_/);
  const media = await request.get("/api/media", { headers: { authorization: `Bearer ${token}` } });
  expect(media.status()).toBe(200);

  const registration = await (await request.post("/api/oauth/register", { data: { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] } })).json();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const query = new URLSearchParams({ response_type: "code", client_id: registration.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: challenge, code_challenge_method: "S256", state: "s1", resource: `${ORIGIN}/api/mcp` });
  let landed = "";
  await consent.route("https://claude.ai/**", (route) => { landed = route.request().url(); return route.fulfill({ status: 200, body: "ok" }); });
  await consent.goto(`/oauth/authorize?${query}`);
  await expect(consent.getByText(/يطلب/)).toContainText("Claude");
  await consent.getByLabel("رمز جديد من تطبيق المصادقة").fill(code(secret, 0));
  await consent.getByRole("button", { name: "السماح بالربط" }).click();
  await expect.poll(() => landed).toContain("code=");
  const callback = new URL(landed);
  expect(callback.searchParams.get("state")).toBe("s1");
  const issued = await (await request.post("/api/oauth/token", { form: { grant_type: "authorization_code", code: callback.searchParams.get("code")!, redirect_uri: "https://claude.ai/api/mcp/auth_callback", client_id: registration.client_id, code_verifier: verifier } })).json();
  const tools = await request.post("/api/mcp", { headers: { authorization: `Bearer ${issued.access_token}`, accept: "application/json, text/event-stream" }, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect((await tools.json()).result.tools.length).toBeGreaterThan(25);
  await admin.reload();
  if (await menu.isVisible()) await menu.click();
  await admin.getByRole("button", { name: "إدارة النظام" }).click();
  await admin.getByRole("tab", { name: "API وMCP" }).click();
  await expect(admin.getByText("Claude").first()).toBeVisible();
});
