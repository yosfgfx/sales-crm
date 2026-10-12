/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads transpiled TypeScript through CommonJS. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHash, randomBytes } = require("node:crypto");
const { createHarness } = require("./helpers/harness.cjs");

let h, totp, crypto, keys, oauth, mcpRoute, secret;
const step = () => Math.floor(Date.now() / 30_000);
const route = (file) => require(path.join(h.root, "app", file, "route.ts"));
const bearer = (token, url = "/api/media", init = {}) => new Request(`${h.ORIGIN}${url}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
const accessAction = (who, body) => keys.apiAccessAction(h.jsonRequest("/api/api-access", body, { cookie: h.cookies[who] }));
const rpc = (token, method, params = {}, id = 1) => mcpRoute.POST(new Request(`${h.ORIGIN}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }));
const callTool = async (token, name, args = {}) => { const body = await (await rpc(token, "tools/call", { name, arguments: args })).json(); if (!body.result) throw new Error(`${name}: ${JSON.stringify(body).slice(0, 400)}`); return body.result; };
const toolJson = (result) => JSON.parse(result.content[0].text);

before(async () => {
  h = await createHarness();
  totp = require(path.join(h.root, "lib/server/totp.ts"));
  crypto = require(path.join(h.root, "lib/server/crypto.ts"));
  keys = require(path.join(h.root, "lib/server/api-keys.ts"));
  oauth = require(path.join(h.root, "lib/server/oauth.ts"));
  mcpRoute = route("api/mcp");
  secret = totp.newSecret();
  for (const who of ["admin", "noura"]) await h.pg.query("update wasl.accounts set totp_secret_enc = $2 where member_id = $1", [who, crypto.encryptSecret(secret)]);
});
after(async () => { await h.close(); });

let adminToken;

test("only administrators see or create programmatic access, and a key needs a fresh authenticator code", async () => {
  await assert.rejects(keys.readApiAccess(h.getRequest("/api/api-access", h.cookies.noura)), (error) => error.code === "API_DISABLED");
  await assert.rejects(accessAction("noura", { action: "create", name: "x", days: 30, code: totp.codeAt(secret, step()) }), (error) => error.code === "API_DISABLED");
  await assert.rejects(accessAction("manager", { action: "create", name: "x", days: 30, code: "000000" }), (error) => error.code === "API_DISABLED");
  await assert.rejects(accessAction("root", { action: "create", name: "x", days: 30, code: "123456" }), (error) => error.code === "MFA_REQUIRED_FOR_KEYS");
  await assert.rejects(accessAction("admin", { action: "create", name: "x", days: 30, code: "000000" }), (error) => error.code === "INVALID_MFA");
  const created = await accessAction("admin", { action: "create", name: "Claude Code", days: 90, code: totp.codeAt(secret, step() - 1) });
  assert.match(created.token, /^wasl_[A-Za-z0-9_-]{40,}$/);
  adminToken = created.token;
  const stored = (await h.pg.query("select token_hash, prefix from wasl.api_keys where id = $1", [created.id])).rows[0];
  assert.equal(stored.token_hash, createHash("sha256").update(adminToken).digest("hex"));
  assert.ok(!JSON.stringify(await keys.readApiAccess(h.getRequest("/api/api-access", h.cookies.admin))).includes(adminToken));
});

test("an administrator key works on every REST endpoint with full admin power and is audited", async () => {
  const auth = require(path.join(h.root, "lib/server/auth.ts"));
  const state = require(path.join(h.root, "lib/server/state.ts"));
  const member = await auth.requireUser(bearer(adminToken));
  assert.equal(member.id, "admin");
  assert.ok((await state.loadStateFor(member)).data.ideas.length > 0);
  const ops = require(path.join(h.root, "lib/server/ops.ts"));
  const result = await ops.runOperation(new Request(`${h.ORIGIN}/api/ops`, { method: "POST", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ type: "addCompany", name: "شركة عبر المفتاح" }) }));
  assert.ok(result.companies.some((company) => company.name === "شركة عبر المفتاح"));
  const accounts = await auth.readAccounts(bearer(adminToken, "/api/accounts"));
  assert.ok(accounts.accounts.length > 3);
  await assert.rejects(keys.apiAccessAction(new Request(`${h.ORIGIN}/api/api-access`, { method: "POST", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" }, body: JSON.stringify({ action: "create", name: "y", days: 30, code: "1" }) })), (error) => error.code === "KEYS_FROM_UI_ONLY");
  const log = (await h.pg.query("select action from wasl.api_audit where member_id = 'admin' order by id")).rows.map((row) => row.action);
  assert.ok(log.includes("POST /api/ops") && log.includes("GET /api/accounts"));
  assert.equal(await auth.sessionUser(bearer("wasl_" + "x".repeat(43))), null);
});

test("MCP: unauthenticated calls get an OAuth challenge, tools list covers the system, and tools act with the key's rights", async () => {
  const anonymous = await mcpRoute.POST(new Request(`${h.ORIGIN}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get("www-authenticate"), /resource_metadata="http:\/\/localhost:3000\/\.well-known\/oauth-protected-resource\/api\/mcp"/);
  const init = await (await rpc(adminToken, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } })).json();
  assert.equal(init.result.serverInfo.name, "wasl");
  assert.match(init.result.instructions, /Wasl/);
  const tools = (await (await rpc(adminToken, "tools/list")).json()).result.tools.map((item) => item.name);
  for (const name of ["wasl_overview", "list_ideas", "get_idea", "create_idea", "update_idea", "submit_idea", "review_idea", "schedule_idea", "set_design_status", "add_comment", "add_quotation", "upload_attachment", "get_file", "delete_idea", "manage_account", "manage_reference", "archive_status", "archive_action", "import_ideas", "monthly_report", "list_team", "run_background_jobs"]) assert.ok(tools.includes(name), name);
  const overview = toolJson(await callTool(adminToken, "wasl_overview"));
  assert.equal(overview.viewer.id, "admin");
  const created = toolJson(await callTool(adminToken, "create_idea", { title: "فكرة من MCP", companyId: "mawaredcom", department: "التواصل", categoryId: "wellbeing", workType: "design", content: "نص", executionPlan: "خطة", channels: ["screens"], ownerId: "noura", dueDate: "2026-12-01" }));
  assert.equal(created.status, "draft");
  const listed = toolJson(await callTool(adminToken, "list_ideas", { query: "فكرة من MCP" }));
  assert.equal(listed.total, 1);
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c80000000049454e44ae426082", "hex");
  const uploaded = toolJson(await callTool(adminToken, "upload_attachment", { ideaId: created.id, kind: "brief", fileName: "مرجع.png", mimeType: "image/png", contentBase64: png.toString("base64") }));
  assert.equal(uploaded.idea.files.length, 1);
  const image = await callTool(adminToken, "get_file", { attachmentId: uploaded.attached.id });
  assert.equal(image.content[0].type, "image");
  const commented = toolJson(await callTool(adminToken, "add_comment", { ideaId: created.id, text: "تعليق عبر MCP" }));
  assert.equal(commented.history.at(-1).action, "comment");
  const refused = await callTool(adminToken, "delete_idea", { ideaId: created.id });
  assert.equal(refused.isError, true);
  const report = toolJson(await callTool(adminToken, "monthly_report", { month: "2026-10" }));
  assert.ok("byCompany" in report);
  const denied = await callTool(adminToken, "upload_attachment", { ideaId: created.id, kind: "brief", sourceUrl: "https://127.0.0.1/secret" });
  assert.equal(denied.isError, true);
  const audited = (await h.pg.query("select count(*)::int as n from wasl.api_audit where channel = 'mcp' and member_id = 'admin'")).rows[0].n;
  assert.ok(audited >= 8);
});

test("OAuth 2.1: discovery, dynamic registration, consent with an authenticator code, PKCE, refresh rotation and reuse detection", async () => {
  const resource = await (await route(".well-known/oauth-protected-resource/api/mcp").GET(h.getRequest("/.well-known/oauth-protected-resource/api/mcp"))).json();
  assert.equal(resource.resource, "http://localhost:3000/api/mcp");
  const metadata = await (await route(".well-known/oauth-authorization-server").GET(h.getRequest("/.well-known/oauth-authorization-server"))).json();
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  const bad = await route("api/oauth/register").POST(new Request(`${h.ORIGIN}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "x", redirect_uris: ["javascript:alert(1)"] }) }));
  assert.equal(bad.status, 400);
  const registered = await (await route("api/oauth/register").POST(new Request(`${h.ORIGIN}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none" }) }))).json();
  assert.match(registered.client_id, /^wasl-client-/);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const consent = { client_id: registered.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: challenge, code_challenge_method: "S256", state: "abc", resource: "http://localhost:3000/api/mcp", approve: true };
  await assert.rejects(oauth.approveAuthorization(h.jsonRequest("/api/oauth/authorize", { ...consent, code: totp.codeAt(secret, step()) }, { cookie: h.cookies.noura })), (error) => error.code === "API_DISABLED");
  await assert.rejects(oauth.approveAuthorization(h.jsonRequest("/api/oauth/authorize", { ...consent, redirect_uri: "https://evil.example/cb", code: totp.codeAt(secret, step()) }, { cookie: h.cookies.admin })), (error) => error.code === "INVALID_CLIENT");
  const approved = await oauth.approveAuthorization(h.jsonRequest("/api/oauth/authorize", { ...consent, code: totp.codeAt(secret, step()) }, { cookie: h.cookies.admin }));
  const redirect = new URL(approved.redirect);
  assert.equal(redirect.searchParams.get("state"), "abc");
  const code = redirect.searchParams.get("code");
  const token = (body) => route("api/oauth/token").POST(new Request(`${h.ORIGIN}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) }));
  assert.equal((await token({ grant_type: "authorization_code", code, redirect_uri: consent.redirect_uri, client_id: registered.client_id, code_verifier: randomBytes(32).toString("base64url") })).status, 400);
  const second = await oauth.approveAuthorization(h.jsonRequest("/api/oauth/authorize", { ...consent, code: totp.codeAt(secret, step() + 1) }, { cookie: h.cookies.admin }));
  const goodCode = new URL(second.redirect).searchParams.get("code");
  const issued = await (await token({ grant_type: "authorization_code", code: goodCode, redirect_uri: consent.redirect_uri, client_id: registered.client_id, code_verifier: verifier })).json();
  assert.equal(issued.token_type, "Bearer");
  assert.equal((await token({ grant_type: "authorization_code", code: goodCode, redirect_uri: consent.redirect_uri, client_id: registered.client_id, code_verifier: verifier })).status, 400);
  assert.equal(toolJson(await callTool(issued.access_token, "wasl_overview")).viewer.id, "admin");
  const rotated = await (await token({ grant_type: "refresh_token", refresh_token: issued.refresh_token, client_id: registered.client_id })).json();
  assert.ok(rotated.access_token && rotated.access_token !== issued.access_token);
  assert.equal((await rpc(issued.access_token, "tools/list")).status, 401);
  const reuse = await token({ grant_type: "refresh_token", refresh_token: issued.refresh_token, client_id: registered.client_id });
  assert.equal(reuse.status, 400);
  assert.equal((await rpc(rotated.access_token, "tools/list")).status, 401);
});

test("opening access to everyone gives members their own rights only, and closing it revokes their keys", async () => {
  await accessAction("admin", { action: "policy", policy: "everyone" });
  const access = await keys.readApiAccess(h.getRequest("/api/api-access", h.cookies.noura));
  assert.equal(access.canManagePolicy, false);
  assert.ok(access.keys.every((key) => key.ownerId === "noura"));
  await assert.rejects(accessAction("noura", { action: "policy", policy: "admins" }), (error) => error.code === "ADMIN_REQUIRED");
  const created = await accessAction("noura", { action: "create", name: "مفتاح نورة", days: 30, code: totp.codeAt(secret, step() + 1) });
  const team = await callTool(created.token, "manage_account", { action: "update", memberId: "sara", active: false });
  assert.equal(team.isError, true);
  await accessAction("admin", { action: "policy", policy: "admins" });
  assert.equal((await rpc(created.token, "tools/list")).status, 401);
  await accessAction("admin", { action: "revoke", id: (await h.pg.query("select id from wasl.api_keys where kind = 'key' and member_id = 'admin'")).rows[0].id });
  assert.equal((await rpc(adminToken, "tools/list")).status, 401);
});
