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
  const ranged = await files.downloadFile(new Request(`${h.ORIGIN}/api/files/${attachment.id}`, { headers: { cookie: h.cookies.faisal, range: "bytes=4194304-8388607" } }), attachment.id);
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("content-range"), `bytes 4194304-8388607/${bytes.length}`);
  assert.equal(Buffer.from(await ranged.arrayBuffer()).length, 4 * 1024 * 1024);
  const open = await files.downloadFile(new Request(`${h.ORIGIN}/api/files/${attachment.id}`, { headers: { cookie: h.cookies.faisal, range: "bytes=0-" } }), attachment.id);
  assert.equal(open.status, 206);
  assert.equal(Buffer.from(await open.arrayBuffer()).length, 4 * 1024 * 1024);
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
  assert.deepEqual(done.rows.map((row) => row.recipient_id).sort(), ["faisal", "manager", "noura"]);
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
  assert.deepEqual(alerts.rows.map((row) => row.recipient_id).sort(), ["admin", "manager", "root"]);
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

test("the daily backup lands in the archive's backup folder on Drive (H8)", async () => {
  const scheduler = require(path.join(h.root, "lib/server/scheduler.ts"));
  const result = await scheduler.backupToDrive(h.database, "2026-10-10");
  assert.ok(result.size > 100);
  const file = fake.files.get(result.fileId);
  assert.equal(file.name, "wasl-backup-2026-10-10.json.gz.enc");
  assert.match(fake.pathOf(file.id), /\/نسخ احتياطية للنظام\/wasl-backup-2026-10-10\.json\.gz\.enc$/);
  assert.equal(file.bytes.subarray(0, 7).toString("latin1"), "WASLBK1");
  assert.ok(!file.bytes.includes(Buffer.from("password_hash")));
  const now = new Date("2026-10-10T09:00:00Z");
  fake.state.failUploads = true;
  assert.deepEqual(await scheduler.runDailyBackup(h.database, "2026-10-11", now), { ran: true, saved: false });
  assert.equal((await scheduler.runDailyBackup(h.database, "2026-10-11", now)).reason, "waiting");
  fake.state.failUploads = false;
  const retried = await scheduler.runDailyBackup(h.database, "2026-10-11", new Date("2026-10-10T09:31:00Z"));
  assert.equal(retried.saved, true);
  assert.equal((await scheduler.runDailyBackup(h.database, "2026-10-11", new Date("2026-10-10T11:00:00Z"))).reason, "done");
});

test("an archive job interrupted mid-run is picked up again once its lock expires (N3)", async () => {
  await h.pg.query("update wasl.archive_jobs set status = 'running', attempts = 1, locked_until = now() - interval '1 minute', next_run_at = now() where idea_id = 'idea-007'");
  await h.pg.query("update wasl.ideas set archive_status = 'running' where id = 'idea-007'");
  const [result] = await archive.runDueArchiveJobs(1);
  assert.equal(result.status, "done");
});

test("a job killed on every attempt stops after the limit and alerts administrators once", async () => {
  await h.pg.query("update wasl.archive_jobs set status = 'running', attempts = 6, notified_failure = false, locked_until = now() - interval '1 minute', next_run_at = now() where idea_id = 'idea-007'");
  const before = (await h.pg.query("select count(*)::int as n from wasl.notifications where type = 'archive' and idea_id = 'idea-007' and recipient_id = 'admin'")).rows[0].n;
  assert.deepEqual(await archive.runDueArchiveJobs(1), []);
  assert.deepEqual(await archive.runDueArchiveJobs(1), []);
  const job = (await h.pg.query("select status::text as status from wasl.archive_jobs where idea_id = 'idea-007' order by created_at desc limit 1")).rows[0];
  assert.equal(job.status, "needs_review");
  assert.equal((await h.pg.query("select archive_status::text as s from wasl.ideas where id = 'idea-007'")).rows[0].s, "needs_review");
  const after = (await h.pg.query("select count(*)::int as n from wasl.notifications where type = 'archive' and idea_id = 'idea-007' and recipient_id = 'admin'")).rows[0].n;
  assert.equal(after - before, 1);
});

test("attachments larger than 100 MB pass validation up to 2 GB (N2)", async () => {
  const { validateMediaData } = require(path.join(h.root, "lib/media-workflow.ts"));
  const { createInitialMediaData } = require(path.join(h.root, "data/media.ts"));
  const data = createInitialMediaData();
  data.ideas[0].attachments = [{ id: "big", name: "video.mp4", size: 1_500_000_000, mime: "video/mp4", url: "/api/files/big", kind: "brief" }];
  assert.doesNotThrow(() => validateMediaData(data));
});

test("parallel uploads to a fresh idea create one project folder and one set of subfolders (N5)", async () => {
  const ideaId = "idea-008";
  const previous = (await h.pg.query("select drive_folder_id from wasl.ideas where id = $1", [ideaId])).rows[0].drive_folder_id;
  if (previous) fake.files.get(previous).trashed = true;
  await h.pg.query("update wasl.ideas set drive_folder_id = null where id = $1", [ideaId]);
  const cookie = h.cookies.noura;
  const start = (name) => uploads.startUpload(h.jsonRequest("/api/uploads", { ideaId, kind: "brief", name, size: 10, mime: "text/plain" }, { cookie }));
  await Promise.all([start("a.txt"), start("b.txt"), start("c.txt")]);
  const folderId = (await h.pg.query("select drive_folder_id from wasl.ideas where id = $1", [ideaId])).rows[0].drive_folder_id;
  const parent = fake.files.get(folderId).parents[0];
  const siblings = [...fake.files.values()].filter((file) => !file.trashed && file.parents.includes(parent) && file.name === fake.files.get(folderId).name);
  assert.equal(siblings.length, 1);
  const children = [...fake.files.values()].filter((file) => !file.trashed && file.parents.includes(folderId));
  assert.equal(children.length, 3);
  assert.equal(new Set(children.map((file) => file.name)).size, 3);
});

test("administrators can find and repair archived files that were trashed, deleted or replaced (P2.8)", async () => {
  const act = (who, body) => integration.integrationAction(h.jsonRequest("/api/integrations/google", body, { cookie: h.cookies[who] }));
  await assert.rejects(act("noura", { action: "scanArchive", ideaId: "idea-008" }), expectStatus(403));
  const rows = (await h.pg.query("select id, drive_file_id from wasl.attachments where idea_id = 'idea-008' and storage = 'drive' and removed_at is null order by created_at")).rows;
  assert.ok(rows.length >= 1);
  const [first] = rows;
  const clean = await act("admin", { action: "scanArchive", ideaId: "idea-008" });
  assert.deepEqual(clean.scan.files, []);
  fake.files.get(first.drive_file_id).trashed = true;
  assert.equal((await act("admin", { action: "scanArchive", ideaId: "idea-008" })).scan.files[0].problem, "trashed");
  await act("admin", { action: "repairAttachment", attachmentId: first.id, mode: "restore" });
  assert.deepEqual((await act("admin", { action: "scanArchive", ideaId: "idea-008" })).scan.files, []);
  fake.files.delete(first.drive_file_id);
  assert.equal((await act("admin", { action: "scanArchive", ideaId: "idea-008" })).scan.files[0].problem, "missing");
  const replacement = await google.uploadWhole({ name: "بديل.png", parentId: "root-of-my-drive", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) });
  await assert.rejects(act("admin", { action: "repairAttachment", attachmentId: first.id, mode: "relink", fileId: (await h.pg.query("select drive_folder_id from wasl.ideas where id = 'idea-008'")).rows[0].drive_folder_id }), (error) => error.code === "INVALID_REPLACEMENT");
  await act("admin", { action: "repairAttachment", attachmentId: first.id, mode: "relink", fileId: replacement.id });
  const relinked = (await h.pg.query("select drive_file_id, size from wasl.attachments where id = $1", [first.id])).rows[0];
  assert.equal(relinked.drive_file_id, replacement.id);
  assert.match(fake.pathOf(replacement.id), /01 الموجز والمحتوى\/بديل\.png$/);
  assert.deepEqual((await act("admin", { action: "scanArchive", ideaId: "idea-008" })).scan.files, []);
  const other = (await h.pg.query("select drive_file_id from wasl.attachments where storage = 'drive' and id <> $1 and drive_file_id is not null limit 1", [first.id])).rows[0];
  if (other) await assert.rejects(act("admin", { action: "repairAttachment", attachmentId: first.id, mode: "relink", fileId: other.drive_file_id }), (error) => error.code === "INVALID_REPLACEMENT");
  const marked = await google.uploadWhole({ name: "نسخة.pdf", parentId: "root-of-my-drive", mime: "application/pdf", bytes: new Uint8Array([1]), appProperties: { waslBackup: "2026-10-01" } });
  await assert.rejects(act("admin", { action: "repairAttachment", attachmentId: first.id, mode: "relink", fileId: marked.id }), (error) => error.code === "INVALID_REPLACEMENT");
  fake.files.delete(replacement.id);
  await act("admin", { action: "repairAttachment", attachmentId: first.id, mode: "ignore" });
  assert.ok((await h.pg.query("select removed_at from wasl.attachments where id = $1", [first.id])).rows[0].removed_at);
  const events = (await h.pg.query("select note from wasl.idea_events where idea_id = 'idea-008' and (action = 'archived' or action = 'attachment_removed') order by at")).rows.map((row) => row.note);
  assert.ok(events.some((note) => /استُعيد/.test(note)) && events.some((note) => /أُعيد ربط/.test(note)) && events.some((note) => /فُقد/.test(note)));
});

test("dropping a lost quotation file keeps the idea usable (third audit)", async () => {
  const act = (who, body) => integration.integrationAction(h.jsonRequest("/api/integrations/google", body, { cookie: h.cookies[who] }));
  const bytes = Buffer.from("%PDF-1.4 quote");
  const file = await uploadThroughDrive("noura", "idea-008", "quotation", bytes, "عرض.pdf");
  await h.op("noura", { type: "addAttachments", ideaId: "idea-008", attachmentIds: [file.id] });
  await h.op("noura", { type: "addQuotation", ideaId: "idea-008", quote: { id: "lost-quote", vendor: "مورد مفقود", amount: 100, scope: "طباعة", days: 2, attachmentId: file.id, recommended: false } });
  const driveId = (await h.pg.query("select drive_file_id from wasl.attachments where id = $1", [file.id])).rows[0].drive_file_id;
  fake.files.delete(driveId);
  await act("admin", { action: "repairAttachment", attachmentId: file.id, mode: "ignore" });
  assert.equal((await h.pg.query("select attachment_id from wasl.quotations where id = 'lost-quote'")).rows[0].attachment_id, null);
  const commented = await h.op("admin", { type: "addComment", ideaId: "idea-008", text: "ما زالت الفكرة قابلة للتعديل" });
  assert.equal(commented.idea.history.at(-1).action, "comment");
});
