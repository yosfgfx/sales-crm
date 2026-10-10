/* eslint-disable @typescript-eslint/no-require-imports -- This Node test runner loads transpiled TypeScript modules through CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, parent, ...args); };
require.extensions['.ts'] = function(mod, filename) { const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText; mod._compile(code, filename); };
const server = require(path.join(root, 'lib/media-server.ts'));
const workflow = require(path.join(root, 'lib/media-workflow.ts'));
const calls = [];
function pass(name) { calls.push(name); }
function jsonRequest(value, cookie = '', origin = 'http://localhost:3000') { return new Request('http://localhost:3000/api/media', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin }, body: JSON.stringify(value) }); }
function request(cookie = '', url = 'http://localhost:3000/api/session') { return new Request(url, { headers: { cookie } }); }
function asCookie(response) { return response.headers.get('set-cookie').split(';')[0]; }
async function rejected(run, status, name) { await assert.rejects(run, error => error.status === status); pass(name); }
(async () => {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'comms-api-tests-'));
  process.env.MEDIA_DATA_DIR = path.join(temporary, 'demo');
  process.env.NODE_ENV = 'development';
  process.env.MEDIA_DEMO_MODE = 'false';
  delete process.env.MEDIA_APP_ORIGIN;
  delete process.env.MEDIA_AUTH_USERS; delete process.env.MEDIA_SESSION_SECRET;
  try {
    let state = await server.readMediaState();
    assert.equal(state.data.ideas.length, 18);
    assert.equal((await server.currentSession(request())).demo, true);
    pass('Development demo and isolated durable seed');
    const nouraLogin = await server.login(jsonRequest({ memberId: 'noura' }));
    const nouraCookie = asCookie(nouraLogin);
    const noura = (await server.currentSession(request(nouraCookie))).user;
    assert.equal(noura.id, 'noura');
    pass('Signed session role switch');
    const edited = workflow.patchMediaIdea(state.data, noura, 'idea-003', { description: 'وصف محدّث للتحقق من الحفظ الدائم والصلاحيات.' });
    const saved = await server.saveMediaState(jsonRequest({ version: state.version, data: edited }, nouraCookie));
    assert.equal(saved.version, state.version + 1);
    assert.equal((await server.readMediaState()).data.ideas.find(i => i.id === 'idea-003').description, 'وصف محدّث للتحقق من الحفظ الدائم والصلاحيات.');
    pass('Authorized content edit persists with revision');
    await rejected(() => server.saveMediaState(jsonRequest({ version: state.version, data: state.data }, nouraCookie)), 409, 'Optimistic conflict prevents lost update');
    state = saved;
    const changedSettings = structuredClone(state.data); changedSettings.settings.departmentName = 'Forged administrator setting';
    await rejected(() => server.saveMediaState(jsonRequest({ version: state.version, data: changedSettings }, nouraCookie)), 403, 'Content cannot change administrator settings');
    const approvalForge = structuredClone(state.data); const forgedIdea = approvalForge.ideas.find(i => i.id === 'idea-002'); forgedIdea.status = 'approved'; forgedIdea.history.push({ id: crypto.randomUUID(), at: new Date().toISOString(), actorId: noura.id, action: 'approved', note: 'تم اعتماد الفكرة وإحالتها تلقائياً إلى فريق التصميم', from: 'review', to: 'approved' });
    await rejected(() => server.saveMediaState(jsonRequest({ version: state.version, data: approvalForge }, nouraCookie)), 403, 'Content cannot forge manager approval');
    await rejected(() => server.saveMediaState(jsonRequest({ version: state.version, data: state.data }, nouraCookie, 'https://attacker.example')), 403, 'Cross-origin writes blocked');
    const form = new FormData(); form.append('ideaId', 'idea-003'); form.append('kind', 'brief'); form.append('files', new Blob(['ordinary arbitrary extension file']), '../../مرحبا.exe');
    const attachments = await server.uploadFiles(new Request('http://localhost:3000/api/files', { method: 'POST', headers: { cookie: nouraCookie, origin: 'http://localhost:3000' }, body: form }));
    assert.equal(attachments.length, 1); assert.equal(attachments[0].name, 'مرحبا.exe'); assert.equal(attachments[0].mime, 'application/octet-stream');
    const withAttachment = workflow.addMediaAttachments(state.data, noura, 'idea-003', attachments);
    state = await server.saveMediaState(jsonRequest({ version: state.version, data: withAttachment }, nouraCookie));
    const fileResponse = await server.downloadFile(request(nouraCookie, `http://localhost:3000/api/files/${attachments[0].id}?inline=1`), attachments[0].id);
    assert.match(fileResponse.headers.get('content-disposition'), /^attachment;/); assert.equal(fileResponse.headers.get('x-content-type-options'), 'nosniff'); assert.equal(await fileResponse.text(), 'ordinary arbitrary extension file');
    pass('Arbitrary-file upload, safe filename, manifest and authenticated download');
    const fakeAttachments = [{ ...attachments[0], id: crypto.randomUUID(), url: 'https://attacker.example/forged.exe' }];
    const fakeState = workflow.addMediaAttachments(state.data, noura, 'idea-003', fakeAttachments);
    await rejected(() => server.saveMediaState(jsonRequest({ version: state.version, data: fakeState }, nouraCookie)), 422, 'Client cannot invent uploaded file references');
    const tampered = workflow.addMediaAttachments(state.data, noura, 'idea-003', [{ ...attachments[0], id: crypto.randomUUID(), name: 'changed' }]);
    await rejected(() => server.saveMediaState(jsonRequest({ version: state.version, data: tampered }, nouraCookie)), 422, 'Unregistered file metadata rejected');
    const unauthorizedForm = new FormData(); unauthorizedForm.append('ideaId', 'idea-001'); unauthorizedForm.append('kind', 'final'); unauthorizedForm.append('channel', 'screens'); unauthorizedForm.append('files', new Blob(['file']), 'final.mp4');
    await rejected(() => server.uploadFiles(new Request('http://localhost:3000/api/files', { method: 'POST', headers: { cookie: nouraCookie, origin: 'http://localhost:3000' }, body: unauthorizedForm })), 403, 'Content cannot upload designer deliverables');
    const drive = await server.listDriveFiles(request(nouraCookie, 'http://localhost:3000/api/drive?date=2026-10-08'));
    assert.equal(drive.configured, false); assert.equal(drive.files.length, 0); pass('Unconfigured Drive reports honest disconnected state');
    const currentVersion = state.version;
    const firstWrite = workflow.patchMediaIdea(state.data, noura, 'idea-003', { description: 'Concurrent first update' });
    const secondWrite = workflow.patchMediaIdea(state.data, noura, 'idea-003', { description: 'Concurrent second update' });
    const racing = await Promise.allSettled([server.saveMediaState(jsonRequest({ version: state.version, data: firstWrite }, nouraCookie)), server.saveMediaState(jsonRequest({ version: state.version, data: secondWrite }, nouraCookie))]);
    assert.equal(racing.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(racing.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
    state = await server.readMediaState(); assert.equal(state.version, currentVersion + 1); pass('Concurrent writes serialize and preserve newest revision');
    const designerCookie = asCookie(await server.login(jsonRequest({ memberId: 'faisal' })));
    const saraCookie = asCookie(await server.login(jsonRequest({ memberId: 'sara' })));
    const imageForm = new FormData(); imageForm.append('ideaId', 'idea-001'); imageForm.append('kind', 'final'); imageForm.append('channel', 'screens'); imageForm.append('files', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=', 'base64')], {type: 'text/html'}), 'screen.png');
    const imageFiles = await server.uploadFiles(new Request('http://localhost:3000/api/files', { method: 'POST', headers: { cookie: designerCookie, origin: 'http://localhost:3000' }, body: imageForm }));
    assert.equal(imageFiles[0].mime, 'image/png');
    await rejected(() => server.downloadFile(request(saraCookie), imageFiles[0].id), 403, 'Unattached draft files are private to uploader and administrator');
    const imagePreview = await server.downloadFile(request(designerCookie, `http://localhost:3000/api/files/${imageFiles[0].id}?inline=1`), imageFiles[0].id);
    assert.equal(imagePreview.headers.get('content-type'), 'image/png'); assert.match(imagePreview.headers.get('content-disposition'), /^inline;/); pass('Assigned designer uploads and previews sniffed safe image');
    const oversized = new FormData(); oversized.append('ideaId', 'idea-003'); oversized.append('kind', 'brief'); oversized.append('files', new Blob([new Uint8Array(26 * 1024 * 1024)]), 'oversized.bin');
    await rejected(() => server.uploadFiles(new Request('http://localhost:3000/api/files', { method: 'POST', headers: { cookie: nouraCookie, origin: 'http://localhost:3000' }, body: oversized })), 413, 'Twenty-five megabyte per-file limit enforced');
    const adminCookie = asCookie(await server.login(jsonRequest({ memberId: 'admin' })));
    const admin = state.data.members.find(member => member.id === 'admin');
    function logoRequest(cookie, blob = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=', 'base64')])) { const form = new FormData(); form.append('kind', 'logo'); form.append('files', blob, 'department.png'); return new Request('http://localhost:3000/api/files', { method: 'POST', headers: { cookie, origin: 'http://localhost:3000' }, body: form }); }
    await rejected(() => server.uploadFiles(logoRequest(nouraCookie)), 403, 'Department logo upload restricted to sole administrator');
    const logos = await server.uploadFiles(logoRequest(adminCookie));
    assert.match(logos[0].url, /^\/api\/files\/[a-f0-9-]{36}\?inline=1$/);
    const logoState = workflow.updateMediaSettings(state.data, admin, { logoUrl: logos[0].url });
    state = await server.saveMediaState(jsonRequest({ version: state.version, data: logoState }, adminCookie));
    assert.equal(state.data.settings.logoUrl, logos[0].url);
    const logoView = await server.downloadFile(request(nouraCookie, 'http://localhost:3000' + logos[0].url), logos[0].id);
    assert.equal(logoView.headers.get('content-type'), 'image/png'); pass('Administrator logo upload persists and is visible to authenticated team');
    await rejected(() => server.uploadFiles(logoRequest(adminCookie, new Blob(['<svg><script>alert(1)</script></svg>'], {type: 'image/svg+xml'}))), 422, 'Executable SVG upload rejected for department logo');
    const forgedLogo = workflow.updateMediaSettings(state.data, admin, { logoUrl: 'https://attacker.example/fake-logo.png' });
    await rejected(() => server.saveMediaState(jsonRequest({ version: state.version, data: forgedLogo }, adminCookie)), 422, 'Settings logo must reference registered safe image');
    server.assertSameOrigin(new Request('http://localhost:3000/api/session', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })); pass('Next canonical localhost URL accepts real 127.0.0.1 Host origin');
    assert.throws(() => server.assertSameOrigin(new Request('http://localhost:3000/api/session', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'https://attacker.example' } })), error => error.status === 403); pass('Real Host origin check still denies cross-origin attacker');
    assert.throws(() => server.assertSameOrigin(new Request('http://localhost:3000/api/session', { method: 'POST', headers: { host: 'localhost:3000/attacker', origin: 'http://localhost:3000' } })), error => error.status === 403); pass('Malformed Host header rejected');
    const archiveRequest = (ideaId, cookie) => new Request('http://localhost:3000/api/drive', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie }, body: JSON.stringify({ ideaId }) });
    await rejected(() => server.archiveDriveFiles(archiveRequest('idea-011', adminCookie)), 422, 'Demo deliverables cannot be written to Google Drive');
    await rejected(() => server.archiveDriveFiles(archiveRequest('idea-001', nouraCookie)), 403, 'Content cannot archive designer deliverables');
    await rejected(() => server.archiveDriveFiles(archiveRequest('idea-001', designerCookie)), 422, 'Drive archive requires delivered workflow status');
    const physicalFinals = [...imageFiles];
    for (const channel of ['whatsapp', 'email']) { const form = new FormData(); form.append('ideaId', 'idea-001'); form.append('kind', 'final'); form.append('channel', channel); form.append('files', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=', 'base64')]), `${channel}.png`); physicalFinals.push(...await server.uploadFiles(new Request('http://localhost:3000/api/files', { method: 'POST', headers: { cookie: designerCookie, origin: 'http://localhost:3000' }, body: form }))); }
    const designer = state.data.members.find(member => member.id === 'faisal');
    state = await server.saveMediaState(jsonRequest({ version: state.version, data: workflow.addMediaAttachments(state.data, designer, 'idea-001', physicalFinals) }, designerCookie));
    state = await server.saveMediaState(jsonRequest({ version: state.version, data: workflow.changeMediaDesignStatus(state.data, designer, 'idea-001', 'design_review') }, designerCookie));
    state = await server.saveMediaState(jsonRequest({ version: state.version, data: workflow.changeMediaDesignStatus(state.data, designer, 'idea-001', 'delivered') }, designerCookie));
    const disconnectedArchive = await server.archiveDriveFiles(archiveRequest('idea-001', designerCookie)); assert.equal(disconnectedArchive.status, 503); assert.equal((await disconnectedArchive.json()).configured, false); pass('Physical delivered archive reports unconfigured Drive without false success');
    state = await server.saveMediaState(jsonRequest({ version: state.version, data: workflow.updateMediaSettings(state.data, admin, { driveFolderId: 'test-shared-folder-123' }) }, adminCookie));
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test-service@example.iam.gserviceaccount.com'; process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = rsa.privateKey;
    const originalFetch = global.fetch;
    const googleFiles = new Map(), uploadMetadata = new Map(), scopes = new Set();
    let generated = 0, putCount = 0, failSecondUpload = true, uncertainNextUpload = false;
    const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    global.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      if (url.hostname === 'oauth2.googleapis.com') { const assertion = new URLSearchParams(options.body.toString()).get('assertion'); const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url')); scopes.add(claims.scope); return jsonResponse({ access_token: 'mock-token', expires_in: 3600 }); }
      assert.equal(url.hostname, 'www.googleapis.com', 'Mock forbids unexpected external destinations');
      if (url.pathname.endsWith('/generateIds')) return jsonResponse({ ids: [`google-file-${++generated}`] });
      if (url.pathname === '/upload/drive/v3/files' && options.method === 'POST') { const metadata = JSON.parse(options.body); uploadMetadata.set(metadata.id, metadata); return new Response('', { status: 200, headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${metadata.id}` } }); }
      if (url.pathname === '/upload/drive/v3/files' && options.method === 'PUT') { putCount++; const id = url.searchParams.get('upload_id'); if (failSecondUpload && putCount === 2) { failSecondUpload = false; return jsonResponse({ error: { errors: [{ reason: 'backendError' }] } }, 500); } const file = { ...uploadMetadata.get(id), webViewLink: `https://drive.google.com/file/d/${id}/view`, trashed: false }; googleFiles.set(id, file); if (uncertainNextUpload) { uncertainNextUpload = false; throw new Error('Mock connection lost after remote completion'); } return jsonResponse(file); }
      if (url.pathname === '/drive/v3/files') return jsonResponse({ files: [...googleFiles.values()] });
      if (url.pathname.startsWith('/drive/v3/files/')) { const id = url.pathname.split('/').at(-1); return googleFiles.has(id) ? jsonResponse(googleFiles.get(id)) : jsonResponse({}, 404); }
      throw new Error('Unexpected mock Google route');
    };
    try {
      const partial = await server.archiveDriveFiles(archiveRequest('idea-001', designerCookie)); const partialBody = await partial.json(); assert.equal(partial.status, 502); assert.equal(partialBody.files.length, 1); assert.equal(partialBody.remainingAttachmentIds.length, 2); assert.equal(googleFiles.size, 1); pass('Drive partial upload failure returns completed work and every remaining attachment');
      const resumed = await server.archiveDriveFiles(archiveRequest('idea-001', designerCookie)); const resumedBody = await resumed.json(); assert.equal(resumed.status, 200); assert.equal(resumedBody.files.length, 3); assert.equal(resumedBody.alreadyArchivedCount, 1); assert.equal(generated, 3); assert.equal(googleFiles.size, 3); pass('Drive retry completes remaining originals using durable pre-generated IDs');
      const beforeRepeat = putCount; const repeated = await server.archiveDriveFiles(archiveRequest('idea-001', adminCookie)); const repeatedBody = await repeated.json(); assert.equal(repeated.status, 200); assert.equal(repeatedBody.alreadyArchivedCount, 3); assert.equal(putCount, beforeRepeat); assert.equal(generated, 3); pass('Repeated Drive archive creates no duplicate uploads');
      await server.listDriveFiles(request(nouraCookie, 'http://localhost:3000/api/drive?date=2026-10-08')); assert.ok(scopes.has('https://www.googleapis.com/auth/drive.file')); assert.ok(scopes.has('https://www.googleapis.com/auth/drive.metadata.readonly')); pass('Drive write and browse tokens use separate minimal OAuth scopes');
      state = await server.saveMediaState(jsonRequest({ version: state.version, data: workflow.updateMediaSettings(state.data, admin, { driveFolderId: 'second-shared-folder-123' }) }, adminCookie));
      uncertainNextUpload = true; const uncertain = await server.archiveDriveFiles(archiveRequest('idea-001', adminCookie)); assert.equal(uncertain.status, 502); assert.equal(googleFiles.size, 4); const recovered = await server.archiveDriveFiles(archiveRequest('idea-001', adminCookie)); const recoveredBody = await recovered.json(); assert.equal(recovered.status, 200); assert.equal(recoveredBody.alreadyArchivedCount, 1); assert.equal(googleFiles.size, 6); assert.equal(generated, 6); pass('Uncertain remote completion is recovered by original ID without duplicate file');
    } finally { global.fetch = originalFetch; delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL; delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY; }
    const plaintext = 'a very strong private test password'; const salt = crypto.randomBytes(24); const derived = crypto.scryptSync(plaintext, salt, 64);
    process.env.NODE_ENV = 'production'; process.env.MEDIA_DATA_DIR = path.join(temporary, 'production'); process.env.MEDIA_SESSION_SECRET = crypto.randomBytes(48).toString('hex'); process.env.MEDIA_AUTH_USERS = JSON.stringify([{ id: 'admin', passwordHash: `scrypt:${salt.toString('hex')}:${derived.toString('hex')}` }]);
    assert.equal((await server.readMediaState()).data.ideas.length, 0);
    assert.equal((await server.currentSession(request())).user, null); pass('Production starts empty and denies anonymous access');
    await rejected(() => server.requireUser(request()), 401, 'Production APIs require authentication');
    await rejected(() => server.login(jsonRequest({ memberId: 'admin', password: 'incorrect' })), 401, 'Wrong production password denied');
    const loggedIn = await server.login(jsonRequest({ memberId: 'admin', password: plaintext }));
    const productionCookie = asCookie(loggedIn); assert.equal((await server.currentSession(request(productionCookie))).user.id, 'admin');
    const sessionText = JSON.stringify(await loggedIn.json()); assert.ok(!sessionText.includes(plaintext)); assert.ok(!sessionText.includes(derived.toString('hex'))); pass('Scrypt password authentication without credential disclosure');
    const alteredCookie = productionCookie.slice(0, -1) + (productionCookie.at(-1) === 'x' ? 'y' : 'x'); assert.equal((await server.currentSession(request(alteredCookie))).user, null); pass('Tampered HMAC session denied');
    const loggedOut = await server.logout(new Request('http://localhost:3000/api/session', { method: 'DELETE', headers: { cookie: productionCookie, origin: 'http://localhost:3000' } })); assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/); pass('Production logout expires browser session');
    delete process.env.MEDIA_AUTH_USERS; delete process.env.MEDIA_SESSION_SECRET; assert.equal((await server.currentSession(request())).demo, false); await rejected(() => server.requireUser(request()), 401, 'Production fails closed without credentials');
    console.log(JSON.stringify({ passed: calls.length, checks: calls }, null, 2));
  } finally { await fsp.rm(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
