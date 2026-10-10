import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MediaServerError } from "./http";

const BUCKET = "wasl-files";

export function dataDirectory() {
  const directory = process.env.MEDIA_DATA_DIR;
  if (directory) {
    if (!path.isAbsolute(directory)) throw new MediaServerError("يجب أن يكون مسار حفظ الملفات على الخادم مساراً كاملاً.", 503, "STORAGE_CONFIGURATION");
    return directory;
  }
  return path.join(process.cwd(), ".media-data");
}

function supabase() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}


export async function putBlob(id: string, bytes: Uint8Array, mime: string): Promise<{ storage: "supabase" | "local"; key: string }> {
  const remote = supabase();
  if (remote) {
    const key = `files/${id}`;
    const response = await fetch(`${remote.url}/storage/v1/object/${BUCKET}/${key}`, { method: "POST", headers: { Authorization: `Bearer ${remote.key}`, apikey: remote.key, "Content-Type": mime || "application/octet-stream", "x-upsert": "false" }, body: bytes as BodyInit, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new MediaServerError("تعذّر حفظ الملف مؤقتاً على الخادم. أعد المحاولة.", 502, "BLOB_WRITE_FAILED");
    return { storage: "supabase", key };
  }
  const directory = path.join(dataDirectory(), "files");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, `${id}.blob`), bytes, { flag: "wx", mode: 0o600 });
  return { storage: "local", key: `${id}.blob` };
}

export async function readBlob(storage: string, key: string): Promise<Uint8Array> {
  if (storage === "supabase") {
    const remote = supabase();
    if (!remote) throw new MediaServerError("تخزين الملفات المؤقت غير مهيأ على الخادم.", 503, "BLOB_CONFIGURATION");
    const response = await fetch(`${remote.url}/storage/v1/object/${BUCKET}/${key}`, { headers: { Authorization: `Bearer ${remote.key}`, apikey: remote.key }, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new MediaServerError("تعذّر العثور على الملف المحفوظ. تواصل مع المسؤول.", 404, "FILE_NOT_FOUND");
    return new Uint8Array(await response.arrayBuffer());
  }
  try { return new Uint8Array(await readFile(path.join(dataDirectory(), "files", path.basename(key)))); }
  catch { throw new MediaServerError("تعذّر العثور على الملف المحفوظ. تواصل مع المسؤول.", 404, "FILE_NOT_FOUND"); }
}

export async function deleteBlob(storage: string, key: string) {
  if (storage === "supabase") {
    const remote = supabase();
    if (remote) await fetch(`${remote.url}/storage/v1/object/${BUCKET}/${key}`, { method: "DELETE", headers: { Authorization: `Bearer ${remote.key}`, apikey: remote.key } }).catch(() => undefined);
    return;
  }
  await rm(path.join(dataDirectory(), "files", path.basename(key)), { force: true });
}
