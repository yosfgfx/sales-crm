/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test double for the Node test runner. */
const { randomUUID } = require("node:crypto");

function createFakeDrive() {
  const files = new Map([["root-of-my-drive", { id: "root-of-my-drive", name: "My Drive", mimeType: "application/vnd.google-apps.folder", parents: [], trashed: false }]]);
  const sessions = new Map();
  const calls = [];
  const state = { failUploads: false, refreshFails: false };
  const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
  const view = (file) => ({ id: file.id, name: file.name, mimeType: file.mimeType, parents: file.parents, trashed: file.trashed, webViewLink: `https://drive.google.com/file/d/${file.id}/view`, size: file.bytes ? String(file.bytes.length) : undefined });
  const create = (meta, bytes) => { const id = `f${randomUUID().replace(/-/g, "").slice(0, 20)}`; const file = { id, name: meta.name, mimeType: meta.mimeType || "application/octet-stream", parents: meta.parents || ["root-of-my-drive"], trashed: false, appProperties: meta.appProperties || {}, bytes }; files.set(id, file); return file; };

  async function handler(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    calls.push(`${method} ${url.pathname}`);
    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
      if (state.refreshFails) return json({ error: "invalid_grant" }, 400);
      const body = new URLSearchParams(String(init.body));
      if (body.get("grant_type") === "authorization_code") return json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/drive.file", id_token: `x.${Buffer.from(JSON.stringify({ email: "yosfgfx@gmail.com" })).toString("base64url")}.y` });
      return json({ access_token: "access-2", expires_in: 3600 });
    }
    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/revoke") return new Response("", { status: 200 });
    if (url.hostname !== "www.googleapis.com") throw new Error(`Unexpected host ${url.hostname}`);
    if (url.pathname === "/drive/v3/about") return json({ storageQuota: { limit: String(15 * 1024 ** 3), usage: String(1024 ** 3) } });
    if (url.pathname === "/drive/v3/files" && method === "POST") return json(view(create(JSON.parse(String(init.body)))));
    if (url.pathname === "/upload/drive/v3/files" && url.searchParams.get("uploadType") === "resumable" && !url.searchParams.get("upload_id")) {
      if (state.failUploads) return json({ error: { errors: [{ reason: "backendError" }] } }, 500);
      const id = randomUUID();
      sessions.set(id, { meta: JSON.parse(String(init.body)), total: Number(init.headers["X-Upload-Content-Length"]), parts: [] });
      return new Response("", { status: 200, headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${id}` } });
    }
    if (url.pathname === "/upload/drive/v3/files" && url.searchParams.get("upload_id")) {
      const session = sessions.get(url.searchParams.get("upload_id"));
      const range = init.headers["Content-Range"];
      if (range.startsWith("bytes */")) { const received = session.parts.reduce((sum, part) => sum + part.length, 0); return new Response("", { status: 308, headers: received ? { range: `bytes=0-${received - 1}` } : {} }); }
      session.parts.push(Buffer.from(init.body));
      const received = session.parts.reduce((sum, part) => sum + part.length, 0);
      if (received < session.total) return new Response("", { status: 308, headers: { range: `bytes=0-${received - 1}` } });
      return json(view(create(session.meta, Buffer.concat(session.parts))));
    }
    if (url.pathname === "/upload/drive/v3/files" && url.searchParams.get("uploadType") === "multipart") {
      const body = String(init.body);
      const meta = JSON.parse(body.slice(body.indexOf("{"), body.indexOf("}\r\n") + 1));
      return json(view(create(meta, Buffer.from(body))));
    }
    const match = /^\/drive\/v3\/files\/([^/]+)(\/export)?$/.exec(url.pathname);
    if (match) {
      const file = files.get(decodeURIComponent(match[1]));
      if (!file) return json({ error: { errors: [{ reason: "notFound" }] } }, 404);
      if (match[2]) return new Response(Buffer.from("%PDF-1.7 summary"), { status: 200, headers: { "content-type": "application/pdf" } });
      if (method === "DELETE") { files.delete(file.id); return new Response(null, { status: 204 }); }
      if (method === "PATCH") {
        const remove = (url.searchParams.get("removeParents") || "").split(",").filter(Boolean);
        file.parents = [...file.parents.filter((parent) => !remove.includes(parent)), url.searchParams.get("addParents")].filter(Boolean);
        return json(view(file));
      }
      if (url.searchParams.get("alt") === "media") {
        const range = /^bytes=(\d+)-(\d*)$/.exec(new Headers(init.headers || {}).get("range") || "");
        if (!range) return new Response(file.bytes, { status: 200, headers: { "content-length": String(file.bytes.length) } });
        const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : file.bytes.length - 1, file.bytes.length - 1);
        return new Response(file.bytes.subarray(start, end + 1), { status: 206, headers: { "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${file.bytes.length}` } });
      }
      return json(view(file));
    }
    throw new Error(`Unhandled Drive call ${method} ${url.pathname}`);
  }

  const pathOf = (id) => { const names = []; let file = files.get(id); while (file && file.id !== "root-of-my-drive") { names.unshift(file.name); file = files.get(file.parents[0]); } return names.join("/"); };
  const childrenOf = (id) => [...files.values()].filter((file) => file.parents.includes(id));
  return { handler, files, calls, state, pathOf, childrenOf, create };
}

module.exports = { createFakeDrive };
