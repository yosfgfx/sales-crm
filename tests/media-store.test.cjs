/* eslint-disable @typescript-eslint/no-require-imports -- This test executes the TypeScript client store in Node with an isolated mocked transport. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const compiled = new Map();

function fixture(memberId = "noura") {
  const modules = new Map();
  let transport;
  function load(relative) {
    const filename = path.resolve(root, relative.endsWith(".ts") ? relative : `${relative}.ts`);
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
    if (!compiled.has(filename)) compiled.set(filename, ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
    const localRequire = (name) => name.startsWith("@/") ? load(name.slice(2)) : name.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), name))) : require(name);
    const run = vm.runInThisContext(`(function(require, module, exports, fetch) {\n${compiled.get(filename)}\n})`, { filename });
    run(localRequire, loadedModule, loadedModule.exports, (...args) => transport(...args));
    return loadedModule.exports;
  }
  const { createInitialMediaData } = load("data/media");
  const remote = createInitialMediaData();
  remote.notifications = remote.notifications.filter((notice) => notice.recipientId === memberId);
  const requests = [];
  const handlers = {};
  const storeModule = load("stores/media-store");
  const { useMediaStore: store } = storeModule;
  transport = async (url, options = {}) => {
    requests.push({ url, method: options.method || "GET", body: options.body });
    if (handlers[url]) return handlers[url](options.body ? JSON.parse(options.body) : undefined, options);
    if (url === "/api/session") return Response.json({ user: remote.members.find((member) => member.id === memberId), demo: false, configured: true });
    if (url === "/api/media") return Response.json({ version: 0, data: remote });
    if (url === "/api/accounts") return Response.json({ version: 0, accounts: remote.members.map((member) => ({ memberId: member.id, username: member.id, hasPassword: true, protected: false })) });
    throw new Error(`Unexpected request ${url}`);
  };
  return { store, remote, requests, handlers, storeModule };
}

test("an operation sends only the action and merges the returned idea", async () => {
  const { store, remote, requests, handlers } = fixture();
  await store.getState().initialize();
  const updated = { ...remote.ideas.find((idea) => idea.id === "idea-003"), description: "وصف من الخادم" };
  handlers["/api/ops"] = (body) => { assert.match(body.requestId, /^[a-f0-9-]{36}$/); const { requestId, ...action } = body; void requestId; assert.deepEqual(action, { type: "patchIdea", ideaId: "idea-003", patch: { description: "وصف" } }); return Response.json({ idea: updated, notifications: [] }); };
  await store.getState().patchIdea("idea-003", { description: "وصف" });
  const post = requests.find((request) => request.url === "/api/ops");
  assert.ok(Buffer.byteLength(post.body) < 5 * 1024);
  assert.equal(store.getState().data.ideas.find((idea) => idea.id === "idea-003").description, "وصف من الخادم");
  assert.equal(store.getState().data.ideas.length, remote.ideas.length);
});

test("a created idea is returned from the server and placed first", async () => {
  const { store, remote, handlers } = fixture();
  await store.getState().initialize();
  const created = { ...remote.ideas[0], id: "server-idea", code: "IC-2026-099", title: "جديدة" };
  handlers["/api/ops"] = () => Response.json({ idea: created, notifications: [] });
  const result = await store.getState().createIdea({ title: "جديدة" });
  assert.equal(result.code, "IC-2026-099");
  assert.equal(store.getState().data.ideas[0].id, "server-idea");
});

test("a refused stale form keeps local data unchanged and reports the server message", async () => {
  const { store, handlers } = fixture();
  await store.getState().initialize();
  const before = JSON.stringify(store.getState().data);
  handlers["/api/ops"] = () => Response.json({ error: "تم تحديث الفكرة أثناء تعديلك لها.", code: "FORM_VERSION_CONFLICT" }, { status: 409 });
  await assert.rejects(store.getState().patchIdea("idea-003", { description: "x" }, "old"), (error) => error.code === "FORM_VERSION_CONFLICT");
  assert.equal(JSON.stringify(store.getState().data), before);
  assert.equal(store.getState().error, "تم تحديث الفكرة أثناء تعديلك لها.");
});

test("marking notifications read sends nothing when nothing is unread", async () => {
  const { store, requests } = fixture("omar");
  await store.getState().initialize();
  store.setState((state) => ({ data: { ...state.data, notifications: state.data.notifications.map((notice) => ({ ...notice, read: true })) } }));
  await store.getState().markNotificationsRead();
  assert.equal(requests.filter((request) => request.url === "/api/ops").length, 0);
});

test("network failures and non-JSON error pages become Arabic messages", async () => {
  const { store, handlers } = fixture();
  await store.getState().initialize();
  handlers["/api/ops"] = () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(store.getState().addComment("idea-001", "تعليق"));
  assert.match(store.getState().error, /تعذّر الاتصال بالنظام/);
  handlers["/api/ops"] = () => new Response("<html>Bad gateway</html>", { status: 502 });
  await assert.rejects(store.getState().addComment("idea-001", "تعليق"));
  assert.match(store.getState().error, /تعذّر الوصول إلى النظام/);
});

test("operations run one at a time in submission order", async () => {
  const { store, remote, handlers } = fixture();
  await store.getState().initialize();
  const order = [];
  let releaseFirst;
  handlers["/api/ops"] = async (body) => {
    order.push(`start:${body.text}`);
    if (body.text === "أول") await new Promise((resolve) => { releaseFirst = resolve; });
    order.push(`end:${body.text}`);
    return Response.json({ idea: remote.ideas[0], notifications: [] });
  };
  const first = store.getState().addComment("idea-001", "أول");
  const second = store.getState().addComment("idea-001", "ثانٍ");
  await new Promise((resolve) => setTimeout(resolve, 10));
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["start:أول", "end:أول", "start:ثانٍ", "end:ثانٍ"]);
});

test("account creation uses the accounts API and never keeps the password in shared data", async () => {
  const { store, remote, requests, handlers } = fixture("admin");
  await store.getState().initialize();
  const member = { id: "new-member", name: "عضو", title: "تصميم", role: "designer", initials: "ع", color: "#000", active: true };
  handlers["/api/accounts"] = (body, options) => options?.method === "POST"
    ? Response.json({ version: 0, data: { ...remote, members: [...remote.members, member] }, accounts: [], currentUser: remote.members.find((item) => item.id === "admin"), reloginRequired: false, memberId: "new-member" })
    : Response.json({ version: 0, accounts: [] });
  const created = await store.getState().createAccount({ name: "عضو", title: "تصميم", role: "designer", username: "new.member", password: "Strong-Pass-2026" });
  assert.equal(created.id, "new-member");
  assert.equal(requests.filter((request) => request.url === "/api/ops").length, 0);
  assert.ok(!JSON.stringify(store.getState().data).includes("Strong-Pass-2026"));
});

test("a relogin response or expired session clears private data", async () => {
  const { store, handlers } = fixture("admin");
  await store.getState().initialize();
  handlers["/api/accounts"] = () => Response.json({ version: 0, accounts: [], currentUser: null, reloginRequired: true });
  await store.getState().updateAccount("admin", { name: "اسم جديد" });
  assert.equal(store.getState().currentUser, null);
  assert.equal(store.getState().data.ideas.length, 0);
  const second = fixture("noura");
  await second.store.getState().initialize();
  second.handlers["/api/ops"] = () => Response.json({ error: "يرجى تسجيل الدخول للمتابعة.", code: "AUTH_REQUIRED" }, { status: 401 });
  await assert.rejects(second.store.getState().addComment("idea-001", "x"));
  assert.equal(second.store.getState().currentUser, null);
  assert.equal(second.store.getState().data.ideas.length, 0);
});

test("retry repeats the action that failed on the network (M11)", async () => {
  const { store, remote, handlers } = fixture();
  await store.getState().initialize();
  const bodies = [];
  let fail = true;
  handlers["/api/ops"] = (body) => { bodies.push(body); if (fail) throw new TypeError("Failed to fetch"); return Response.json({ idea: remote.ideas[0], notifications: [] }); };
  await assert.rejects(store.getState().addComment("idea-001", "تعليق مهم"));
  assert.ok(store.getState().lastFailed);
  fail = false;
  await store.getState().retryLast();
  assert.deepEqual(bodies.map((body) => body.text), ["تعليق مهم", "تعليق مهم"]);
  assert.equal(store.getState().lastFailed, null);
});

test("merging a fresh first page keeps older loaded notifications and marks stale unread ones read (P1.5)", () => {
  const { storeModule } = fixture("noura");
  const notice = (n, read = true) => ({ id: `n-${String(n).padStart(3, "0")}`, recipientId: "noura", ideaId: "idea-001", type: "comment", title: `إشعار ${n}`, body: "", createdAt: new Date(Date.UTC(2026, 9, 1) - n * 3_600_000).toISOString(), read });
  const loaded = [...Array.from({ length: 50 }, (_, n) => notice(n)), ...Array.from({ length: 30 }, (_, n) => notice(50 + n, n !== 5))];
  const fresh = [notice(-1, false), ...Array.from({ length: 49 }, (_, n) => notice(n))];
  const combined = storeModule.mergeNotifications(loaded, fresh);
  assert.equal(combined.length, 81);
  assert.equal(combined[0].id, "n-0-1");
  assert.equal(combined.find((item) => item.id === "n-055").read, true);
  assert.equal(new Set(combined.map((item) => item.id)).size, combined.length);
});


test("retrying an uncertain saved action reuses the same idempotency key", async () => {
  const { store, handlers } = fixture(); await store.getState().initialize();
  const attempts = [];
  handlers["/api/ops"] = (body) => { attempts.push(body); if (attempts.length === 1) throw new TypeError("connection lost"); return Response.json({ notifications: [] }); };
  await assert.rejects(store.getState().addComment("idea-003", "تحديث للفريق"));
  await store.getState().retryLast();
  assert.equal(attempts.length, 2); assert.equal(attempts[0].requestId, attempts[1].requestId);
  assert.deepEqual(attempts[0], attempts[1]);
});

test("soft deleted work stays in admin state for the recycle bin and can be restored", async () => {
  const { store, remote, handlers } = fixture("admin"); await store.getState().initialize();
  const original = remote.ideas.find((item) => item.id === "idea-003");
  handlers["/api/ops"] = (body) => Response.json({ idea: body.type === "deleteIdea" ? { ...original, deletedAt: "2026-10-12T07:00:00.000Z", deletedBy: "admin", deletionReason: "تكرار" } : original, notifications: [] });
  await store.getState().deleteIdea(original.id, "تكرار");
  assert.equal(store.getState().data.ideas.length, remote.ideas.length); assert.ok(store.getState().data.ideas.find((item) => item.id === original.id).deletedAt);
  await store.getState().restoreIdea(original.id); assert.equal(store.getState().data.ideas.find((item) => item.id === original.id).deletedAt, undefined);
});
