/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads transpiled TypeScript through CommonJS. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHarness } = require("./helpers/harness.cjs");
const { createFakeDrive } = require("./helpers/fake-drive.cjs");

let h, fake, integration, uploads, archive, google, state, auth;
const realFetch = global.fetch;
const expectStatus = (status) => (error) => error.status === status;

async function uploadThroughDrive(who, ideaId, kind, bytes, name, channel) {
  const start = await uploads.startUpload(h.jsonRequest("/api/uploads", { ideaId, kind, channel, name, size: bytes.length, mime: "image/png" }, { cookie: h.cookies[who] }));
  let offset = 0, result;
  while (offset < bytes.length) {
    const chunk = bytes.subarray(offset, offset + start.chunkSize);
    result = await uploads.putChunk(new Request(`${h.ORIGIN}/api/uploads/${start.uploadId}?offset=${offset}`, { method: "PUT", headers: { cookie: h.cookies[who], origin: h.ORIGIN }, body: chunk }), start.uploadId);
    offset = result.done ? bytes.length : result.received;
  }
  return result.attachment;
}

before(async () => {
  h = await createHarness();
  fake = createFakeDrive();
  global.fetch = fake.handler;
  integration = require(path.join(h.root, "lib/server/integration.ts"));
  uploads = require(path.join(h.root, "lib/server/uploads.ts"));
  archive = require(path.join(h.root, "lib/server/archive.ts"));
  google = require(path.join(h.root, "lib/server/google.ts"));
  state = require(path.join(h.root, "lib/server/state.ts"));
  auth = require(path.join(h.root, "lib/server/auth.ts"));
});
after(async () => { global.fetch = realFetch; await h.close(); });

test("before Drive is connected uploads fall back to the server and the team sees no Drive details", async () => {
  await assert.rejects(uploads.startUpload(h.jsonRequest("/api/uploads", { ideaId: "idea-008", kind: "brief", name: "a.txt", size: 10 }, { cookie: h.cookies.noura })), (error) => error.code === "DRIVE_NOT_CONNECTED");
  const status = await integration.integrationStatus(h.getRequest("/api/integrations/google", h.cookies.faisal));
  assert.deepEqual(Object.keys(status).sort(), ["connected", "folderSelected"]);
});

test("only the owner can connect, and a forged OAuth state is rejected (C2, D2)", async () => {
  await assert.rejects(integration.startConnect(h.getRequest("/api/integrations/google/start", h.cookies.admin)), expectStatus(403));
  const started = await integration.startConnect(h.getRequest("/api/integrations/google/start", h.cookies.root));
  assert.equal(started.status, 303);
  const location = new URL(started.headers.get("location"));
  assert.equal(location.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/drive.file");
  const stateValue = location.searchParams.get("state");
  const stateCookie = started.headers.get("set-cookie").split(";")[0];
  const forged = await integration.finishConnect(new Request(`${h.ORIGIN}/api/integrations/google/callback?state=bad.state&code=x`, { headers: { cookie: stateCookie } }));
  assert.match(forged.headers.get("location"), /drive=error/);
  const done = await integration.finishConnect(new Request(`${h.ORIGIN}/api/integrations/google/callback?state=${encodeURIComponent(stateValue)}&code=good`, { headers: { cookie: stateCookie } }));
  assert.match(done.headers.get("location"), /drive=connected/);
  const row = (await h.pg.query("select account_email, connected_by, refresh_token_enc from wasl.google_integration")).rows[0];
  assert.equal(row.account_email, "yosfgfx@gmail.com");
  assert.equal(row.connected_by, "root");
  assert.ok(!row.refresh_token_enc.includes("refresh-1"));
});

test("an administrator creates WaslPlatform and the status shows it only to administrators (M12, M20)", async () => {
  await assert.rejects(integration.integrationAction(h.jsonRequest("/api/integrations/google", { action: "createDefaultFolder" }, { cookie: h.cookies.noura })), expectStatus(403));
  const created = await integration.integrationAction(h.jsonRequest("/api/integrations/google", { action: "createDefaultFolder" }, { cookie: h.cookies.admin }));
  assert.equal(created.folder.name, "WaslPlatform");
  const adminStatus = await integration.integrationStatus(h.getRequest("/api/integrations/google", h.cookies.admin));
  assert.equal(adminStatus.rootFolder.name, "WaslPlatform");
  assert.equal(adminStatus.canConnect, false);
  await assert.rejects(integration.integrationAction(h.jsonRequest("/api/integrations/google", { action: "disconnect" }, { cookie: h.cookies.admin })), expectStatus(403));
  await assert.rejects(integration.integrationAction(h.jsonRequest("/api/integrations/google", { action: "pickerToken" }, { cookie: h.cookies.faisal })), expectStatus(403));
  const test = await integration.integrationAction(h.jsonRequest("/api/integrations/google", { action: "test" }, { cookie: h.cookies.admin }));
  assert.ok(test.quota.limit > test.quota.usage);
});

test("selecting a folder the app cannot reach gives a clear message (M13)", async () => {
  await assert.rejects(integration.integrationAction(h.jsonRequest("/api/integrations/google", { action: "selectFolder", folderId: "doesnotexist00" }, { cookie: h.cookies.admin })), (error) => error.code === "DRIVE_FOLDER_FORBIDDEN" && /اختره من نافذة/.test(error.message));
});

test("large files upload in chunks straight into the project folder and stream back through the system (C1)", async () => {
  const bytes = Buffer.alloc(9 * 1024 * 1024 + 123, 1);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const attachment = await uploadThroughDrive("noura", "idea-008", "brief", bytes, "صورة.png");
  await h.op("noura", { type: "addAttachments", ideaId: "idea-008", attachmentIds: [attachment.id] });
  const row = (await h.pg.query("select storage, drive_file_id from wasl.attachments where id = $1", [attachment.id])).rows[0];
  assert.equal(row.storage, "drive");
  assert.equal(fake.pathOf(row.drive_file_id).split("/").slice(0, 2).join("/"), "WaslPlatform/قيد التنفيذ");
  assert.match(fake.pathOf(row.drive_file_id), /01 الموجز والمحتوى\/صورة\.png$/);
  const files = require(path.join(h.root, "lib/server/files.ts"));
  const download = await files.downloadFile(h.getRequest(`/api/files/${attachment.id}?inline=1`, h.cookies.faisal), attachment.id);
  assert.equal(download.headers.get("content-type"), "image/png");
  assert.equal(Buffer.from(await download.arrayBuffer()).length, bytes.length);
});

test("delivery archives automatically into year, month and company with a summary, and says so only after success (C1, C3)", async () => {
  const legacyForm = new FormData();
  legacyForm.append("ideaId", "idea-007"); legacyForm.append("kind", "final"); legacyForm.append("channel", "email"); legacyForm.append("files", new Blob(["legacy final"]), "بريد.pdf");
  const files = require(path.join(h.root, "lib/server/files.ts"));
  const legacy = await files.uploadFiles(new Request(`${h.ORIGIN}/api/files`, { method: "POST", headers: { cookie: h.cookies.faisal, origin: h.ORIGIN }, body: legacyForm }));
  const finals = [legacy[0]];
  for (const channel of ["screens", "whatsapp"]) finals.push(await uploadThroughDrive("faisal", "idea-007", "final", Buffer.from(`final ${channel}`), `${channel}.png`, channel));
  await h.op("faisal", { type: "addAttachments", ideaId: "idea-007", attachmentIds: finals.map((file) => file.id) });
  const delivered = await h.op("faisal", { type: "changeDesignStatus", ideaId: "idea-007", status: "delivered" });
  assert.equal(delivered.idea.archive.status, "pending");
  const early = await h.pg.query("select title from wasl.notifications where idea_id = 'idea-007' and (title like '%أرشف%' or title like '%أُرشف%')");
  assert.equal(early.rows.length, 0);
  const [result] = await archive.runDueArchiveJobs(1);
  assert.equal(result.status, "done");
  const idea = (await h.pg.query("select archive_status, drive_folder_id, delivered_at::text as delivered from wasl.ideas where id = 'idea-007'")).rows[0];
  assert.equal(idea.archive_status, "done");
  const month = idea.delivered.slice(5, 7);
  assert.match(fake.pathOf(idea.drive_folder_id), new RegExp(`^WaslPlatform/${idea.delivered.slice(0, 4)}/${month} - أعمال [^/]+/أعمال مواردكم/IC-2026-007 · `));
  const names = fake.childrenOf(idea.drive_folder_id).map((file) => file.name).sort();
  assert.deepEqual(names, ["01 الموجز والمحتوى", "02 عروض الأسعار", "03 التصاميم النهائية", "ملخص المشروع.pdf"]);
  const legacyRow = (await h.pg.query("select storage from wasl.attachments where id = $1", [legacy[0].id])).rows[0];
  assert.equal(legacyRow.storage, "drive");
  const done = await h.pg.query("select recipient_id from wasl.notifications where idea_id = 'idea-007' and type = 'archive'");
  assert.deepEqual(done.rows.map((row) => row.recipient_id).sort(), ["faisal", "noura"]);
  const view = await state.loadStateFor((await auth.currentSession(h.getRequest("/api/media", h.cookies.noura))).user);
  const projected = view.data.ideas.find((item) => item.id === "idea-007");
  assert.equal(projected.archive.status, "done");
  assert.equal(projected.archive.folderUrl, undefined);
});

test("archive failures retry with backoff, then alert administrators once (C1)", async () => {
  await h.op("omar", { type: "changeDesignStatus", ideaId: "idea-006", status: "designing" }).catch(() => undefined);
  await h.pg.query("update wasl.ideas set status = 'delivered', delivered_at = current_date where id = 'idea-006'");
  await h.database.transaction((tx) => archive.enqueueArchive(tx, "idea-006"));
  fake.state.failUploads = true;
  await h.pg.query("insert into wasl.attachments (id, idea_id, kind, channel, name, size, mime, storage, local_path, owner_id) values ('local-x', 'idea-006', 'final', 'screens', 'x.png', 3, 'image/png', 'local', 'missing.blob', 'omar')");
  const first = await archive.runDueArchiveJobs(1);
  assert.equal(first[0].status, "failed");
  await h.pg.query("update wasl.archive_jobs set attempts = 6, next_run_at = now() where idea_id = 'idea-006'");
  const last = await archive.runDueArchiveJobs(1);
  assert.equal(last[0].status, "needs_review");
  const alerts = await h.pg.query("select recipient_id from wasl.notifications where idea_id = 'idea-006' and type = 'archive'");
  assert.deepEqual(alerts.rows.map((row) => row.recipient_id).sort(), ["admin", "root"]);
  const status = await integration.integrationStatus(h.getRequest("/api/integrations/google", h.cookies.admin));
  assert.ok(status.issues.some((issue) => issue.ideaId === "idea-006" && issue.status === "needs_review"));
  fake.state.failUploads = false;
  await h.pg.query("delete from wasl.attachments where id = 'local-x'");
});

test("changing the archive folder can move the existing archive with it", async () => {
  const target = fake.create({ name: "أرشيف جديد", mimeType: "application/vnd.google-apps.folder" });
  await integration.integrationAction(h.jsonRequest("/api/integrations/google", { action: "selectFolder", folderId: target.id, mode: "move" }, { cookie: h.cookies.admin }));
  const moved = fake.childrenOf(target.id).map((file) => file.name).sort();
  assert.ok(moved.includes("قيد التنفيذ"));
  assert.ok(moved.includes("2026"));
});

test("a revoked Google grant stops the archive and asks the owner to reconnect", async () => {
  google.forgetAccessToken();
  fake.state.refreshFails = true;
  await assert.rejects(google.accessToken(), (error) => error.code === "DRIVE_REAUTH_REQUIRED");
  fake.state.refreshFails = false;
});
