/* eslint-disable @typescript-eslint/no-require-imports -- This test executes the TypeScript client store in Node with an isolated mocked transport. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const compiled = new Map();

/** Load a fresh store per test, resolving the app alias without changing Node's global loader. */
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
  const remote = { data: createInitialMediaData(), version: 17 };
  const posts = [];
  const accountRequests = [];
  let accounts = remote.data.members.map((member) => ({ memberId: member.id, username: member.id, hasPassword: true, protected: false }));
  const { useMediaStore: store } = load("stores/media-store");
  let postHandler;
  let accountHandler;
  transport = async (url, options = {}) => {
    if (url === "/api/session") return Response.json({ user: remote.data.members.find((member) => member.id === memberId), demo: true, configured: false });
    if (url === "/api/accounts") {
      if (options.method !== "POST") return Response.json({ accounts, version: remote.version });
      const body = JSON.parse(options.body); accountRequests.push(body);
      if (accountHandler) return accountHandler(body);
      if (body.version !== remote.version) return Response.json({ error: "تم تحديث الحسابات.", code: "VERSION_CONFLICT" }, { status: 409 });
      const workflow = load("lib/media-workflow");
      const currentUser = remote.data.members.find((member) => member.id === memberId);
      if (body.operation === "create") {
        remote.data = workflow.addMediaMember(remote.data, currentUser, body.member);
        accounts.push({ memberId: remote.data.members.at(-1).id, username: body.username, hasPassword: true, protected: false });
      } else {
        remote.data = workflow.updateMediaMember(remote.data, currentUser, body.memberId, body.patch);
        if (body.username !== undefined) accounts = accounts.map((account) => account.memberId === body.memberId ? { ...account, username: body.username } : account);
      }
      remote.version += 1;
      return Response.json({ ...remote, accounts, currentUser: remote.data.members.find((member) => member.id === memberId), reloginRequired: body.operation === "update" && body.memberId === memberId });
    }
    assert.equal(url, "/api/media");
    if (options.method !== "POST") return Response.json(remote);
    const body = JSON.parse(options.body);
    posts.push(body);
    if (postHandler) return postHandler(body);
    if (body.version !== remote.version) return Response.json({ error: "تم تحديث البيانات من عضو آخر.", code: "VERSION_CONFLICT" }, { status: 409 });
    remote.data = body.data;
    remote.version += 1;
    return Response.json(remote);
  };
  store.setState({ data: structuredClone(remote.data), version: remote.version, currentUser: remote.data.members.find((member) => member.id === memberId), initialized: true, loading: false });
  return { store, remote, posts, accountRequests, load, onPost: (handler) => { postHandler = handler; }, onAccount: (handler) => { accountHandler = handler; }, setUsername: (id, username) => { accounts = accounts.map((account) => account.memberId === id ? { ...account, username } : account); } };
}
const idea = (data, id = "idea-008") => data.ideas.find((item) => item.id === id);
const formConflict = (error) => error.code === "FORM_VERSION_CONFLICT" && error.status === 409;

test("open content form rejects a refreshed idea revision before sending any save", async () => {
  const { store, remote, posts } = fixture();
  const openedAt = idea(store.getState().data).updatedAt;
  idea(remote.data).title = "تحديث الزميل أثناء فتح النموذج";
  idea(remote.data).updatedAt = "2026-10-08T07:00:00.000Z";
  remote.version += 1;
  await store.getState().refresh();
  await assert.rejects(store.getState().patchIdea("idea-008", { title: "نص النموذج القديم" }, openedAt), formConflict);
  assert.equal(posts.length, 0);
  assert.equal(idea(store.getState().data).title, "تحديث الزميل أثناء فتح النموذج");
  assert.match(store.getState().error, /احتفظ بتعديلاتك/);
});

test("content save succeeds after the form deliberately reopens the latest revision", async () => {
  const { store, posts } = fixture();
  const openedAt = idea(store.getState().data).updatedAt;
  await store.getState().patchIdea("idea-008", { title: "عنوان تمت مراجعته" }, openedAt);
  assert.equal(posts.length, 1);
  assert.equal(idea(store.getState().data).title, "عنوان تمت مراجعته");
  assert.equal(store.getState().version, 18);
});

test("queued edits recheck their form revision after the previous save finishes", async () => {
  const { store, posts } = fixture();
  const openedAt = idea(store.getState().data).updatedAt;
  const originalContent = idea(store.getState().data).content;
  const saves = await Promise.allSettled([
    store.getState().patchIdea("idea-008", { title: "التعديل الأول" }, openedAt),
    store.getState().patchIdea("idea-008", { content: "نص قديم يجب ألا يُحفظ" }, openedAt),
  ]);
  assert.equal(saves[0].status, "fulfilled");
  assert.equal(saves[1].status, "rejected");
  assert.ok(formConflict(saves[1].reason));
  assert.equal(posts.length, 1);
  assert.equal(idea(store.getState().data).content, originalContent);
});

test("stale design schedule is rejected without replacing a refreshed assignment", async () => {
  const { store, remote, posts } = fixture("admin");
  const openedAt = idea(store.getState().data, "idea-005").updatedAt;
  const record = idea(remote.data, "idea-005");
  record.status = "scheduled"; record.designerId = "omar"; record.scheduledAt = "2026-10-11"; record.updatedAt = "2026-10-08T08:00:00.000Z";
  remote.version += 1;
  await store.getState().refresh();
  await assert.rejects(store.getState().scheduleIdea("idea-005", { designerId: "faisal", scheduledAt: "2026-10-10" }, openedAt), formConflict);
  assert.equal(posts.length, 0);
  assert.equal(idea(store.getState().data, "idea-005").designerId, "omar");
});

test("identity settings save preserves unrelated Drive changes and rejects a stale field", async () => {
  const { store, remote, posts } = fixture("admin");
  const baseline = { ...store.getState().data.settings };
  remote.data.settings.driveFolderId = "new-shared-drive-folder";
  remote.version += 1;
  await store.getState().refresh();
  await store.getState().updateSettings({ departmentName: "إدارة الصحة والعافية المؤسسية" }, { departmentName: baseline.departmentName });
  assert.equal(store.getState().data.settings.driveFolderId, "new-shared-drive-folder");
  assert.equal(posts[0].data.settings.driveFolderId, "new-shared-drive-folder");
  await assert.rejects(store.getState().updateSettings({ departmentName: "اسم من نموذج قديم" }, { departmentName: baseline.departmentName }), formConflict);
  assert.equal(posts.length, 1);
  assert.equal(store.getState().data.settings.departmentName, "إدارة الصحة والعافية المؤسسية");
});

test("every settings key being saved needs its own captured baseline", async () => {
  const { store, posts } = fixture("admin");
  await assert.rejects(store.getState().updateSettings({ departmentName: "اسم جديد", driveFolderId: "new-folder-identifier" }, { departmentName: store.getState().data.settings.departmentName }), formConflict);
  assert.equal(posts.length, 0);
});

test("a server revision conflict refreshes shared state without resubmitting the old form", async () => {
  const { store, remote, posts } = fixture();
  const openedAt = idea(store.getState().data).updatedAt;
  idea(remote.data).title = "النسخة المحفوظة من الزميل"; idea(remote.data).updatedAt = "2026-10-08T09:00:00.000Z"; remote.version += 1;
  await assert.rejects(store.getState().patchIdea("idea-008", { title: "نموذج قديم" }, openedAt), (error) => error.code === "VERSION_CONFLICT");
  assert.equal(posts.length, 1);
  assert.equal(store.getState().version, remote.version);
  assert.equal(idea(store.getState().data).title, "النسخة المحفوظة من الزميل");
});

test("serialized saves use the acknowledged server version for the next independent action", async () => {
  const { store, posts } = fixture();
  await Promise.all([store.getState().addComment("idea-008", "التعليق الأول"), store.getState().addComment("idea-008", "التعليق الثاني")]);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].version, 17); assert.equal(posts[1].version, 18);
  assert.equal(idea(store.getState().data).history.filter((entry) => entry.action === "comment").length, 2);
});

test("retrying the same quotation id cannot append duplicate offers or notifications", async () => {
  const { store, posts } = fixture();
  const file = { id: "quote-file-retry", name: "عرض السعر.pdf", size: 2048, mime: "application/pdf", url: "/api/files/quote-file-retry", kind: "quotation" };
  await store.getState().addAttachments("idea-008", [file]);
  const quote = { id: "quote-retry", vendor: "استوديو الإبداع", amount: 2400, scope: "تعليق صوتي", days: 3, attachmentId: file.id, recommended: true };
  await store.getState().addQuotation("idea-008", quote);
  const notificationCount = store.getState().data.notifications.length;
  await assert.rejects(store.getState().addQuotation("idea-008", quote), /موجود بالفعل/);
  assert.equal(posts.length, 2);
  assert.equal(idea(store.getState().data).quotations.length, 1);
  assert.equal(store.getState().data.notifications.length, notificationCount);
});

test("account creation uses the dedicated API and never copies credentials into shared data", async () => {
  const { store, posts, accountRequests } = fixture("admin");
  const member = await store.getState().createAccount({ name: "خالد السالم", title: "مدير نظام", role: "admin", username: "khaled", password: "test-only-password" });
  assert.equal(posts.length, 0); assert.equal(accountRequests.length, 1);
  assert.equal(accountRequests[0].operation, "create"); assert.equal(accountRequests[0].version, 17);
  assert.deepEqual(accountRequests[0].member, { name: "خالد السالم", title: "مدير نظام", role: "admin" });
  assert.equal(member.role, "admin"); assert.equal(store.getState().version, 18);
  assert.equal(store.getState().accounts.find((account) => account.memberId === member.id).username, "khaled");
  assert.equal(JSON.stringify(store.getState().data).includes("test-only-password"), false);
  assert.equal(JSON.stringify(store.getState().data).includes('"username"'), false);
});

test("account metadata reads and subsequent account saves use the refreshed server revision", async () => {
  const { store, remote, accountRequests } = fixture("admin");
  remote.version += 1;
  const accounts = await store.getState().readAccounts();
  assert.equal(accounts.length, remote.data.members.length); assert.equal(store.getState().version, 18);
  await store.getState().updateAccount("manager", { name: "اسم المدير الصحيح", username: "communications-manager", password: "replacement-test-password" });
  assert.equal(accountRequests[0].version, 18);
  assert.deepEqual(accountRequests[0].patch, { name: "اسم المدير الصحيح" });
  assert.equal(store.getState().data.members.find((member) => member.id === "manager").name, "اسم المدير الصحيح");
  assert.equal(store.getState().accounts.find((account) => account.memberId === "manager").username, "communications-manager");
  assert.equal(store.getState().currentUser.id, "admin");
});

test("changing the signed-in account clears the session and private data until a fresh login", async () => {
  const { store } = fixture("admin");
  await store.getState().updateAccount("admin", { name: "اسمي الصحيح", password: "new-test-password" });
  assert.equal(store.getState().currentUser, null); assert.equal(store.getState().data.ideas.length, 0);
  assert.equal(store.getState().accounts.length, 0); assert.equal(store.getState().accountsLoaded, false);
  assert.equal(store.getState().configured, true); assert.equal(store.getState().demo, false);
  assert.match(store.getState().error, /سجّل الدخول ببياناتك الجديدة/);
});

test("conflicting account updates refresh metadata without retrying the old credential write", async () => {
  const { store, remote, accountRequests } = fixture("admin");
  remote.version += 1;
  remote.data.members.find((member) => member.id === "manager").name = "تحديث مدير آخر";
  await assert.rejects(store.getState().updateAccount("manager", { name: "نموذج قديم", password: "not-to-be-retried" }), (error) => error.code === "VERSION_CONFLICT");
  assert.equal(accountRequests.length, 1); assert.equal(store.getState().version, remote.version);
  assert.equal(store.getState().data.members.find((member) => member.id === "manager").name, "تحديث مدير آخر");
  assert.equal(store.getState().accountsLoaded, true);
});

test("shared refresh reads the current member record and never retains a removed session identity", async () => {
  const { store, remote } = fixture("admin");
  remote.data.members.find((member) => member.id === "admin").role = "manager";
  remote.data.members.push({ id: "second-admin", name: "مدير نظام آخر", title: "مدير نظام", role: "admin", initials: "م ن", color: "#8298AD", active: true });
  remote.version += 1;
  store.setState({ accounts: [{ memberId: "admin", username: "admin", hasPassword: true, protected: false }], accountsLoaded: true });
  await store.getState().refresh();
  assert.equal(store.getState().currentUser.role, "manager");
  assert.equal(store.getState().accounts.length, 0); assert.equal(store.getState().accountsLoaded, false);
});

test("an open account form cannot overwrite refreshed names or usernames", async () => {
  const { store, remote, accountRequests, setUsername } = fixture("admin");
  await store.getState().readAccounts();
  const member = store.getState().data.members.find((item) => item.id === "manager");
  const expected = { name: member.name, title: member.title, role: member.role, active: member.active, username: "manager" };
  setUsername("manager", "new-manager-login"); remote.version += 1;
  await store.getState().refresh();
  await assert.rejects(store.getState().updateAccount("manager", { name: "من النموذج القديم", username: "manager" }, expected), formConflict);
  assert.equal(accountRequests.length, 0);
  assert.equal(store.getState().accounts.find((item) => item.memberId === "manager").username, "new-manager-login");
  const refreshed = { ...expected, username: "new-manager-login" };
  remote.data.members.find((item) => item.id === "manager").name = "اسم زميل أحدث"; remote.version += 1;
  await store.getState().refresh();
  await assert.rejects(store.getState().updateAccount("manager", { name: "من النموذج القديم" }, refreshed), formConflict);
  assert.equal(accountRequests.length, 0);
});

test("queued account forms recheck their baseline after the first acknowledged save", async () => {
  const { store, accountRequests } = fixture("admin");
  await store.getState().readAccounts();
  const member = store.getState().data.members.find((item) => item.id === "manager");
  const expected = { name: member.name, title: member.title, role: member.role, active: member.active, username: "manager" };
  const saves = await Promise.allSettled([
    store.getState().updateAccount("manager", { name: "الاسم المحفوظ أولاً" }, expected),
    store.getState().updateAccount("manager", { name: "اسم من نموذج أقدم", password: "old-form-new-password" }, expected),
  ]);
  assert.equal(saves[0].status, "fulfilled"); assert.equal(saves[1].status, "rejected");
  assert.ok(formConflict(saves[1].reason)); assert.equal(accountRequests.length, 1);
  assert.equal(store.getState().data.members.find((item) => item.id === "manager").name, "الاسم المحفوظ أولاً");
});
