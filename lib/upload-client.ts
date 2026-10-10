import type { Attachment, Channel } from "@/data/media";

type Progress = (sent: number, total: number) => void;

async function json<T>(response: Response): Promise<T & { error?: string; code?: string; current?: { received?: number } }> {
  try { return await response.json(); } catch { throw new Error(response.ok ? "تعذّر قراءة استجابة النظام." : "تعذّر الوصول إلى النظام الآن. أعد المحاولة بعد قليل."); }
}

async function legacyUpload(files: File[], ideaId: string, kind: Attachment["kind"], channel?: Channel): Promise<Attachment[]> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  form.set("ideaId", ideaId);
  form.set("kind", kind);
  if (channel) form.set("channel", channel);
  const response = await fetch("/api/files", { method: "POST", body: form });
  const result = await json<{ files: Attachment[] }>(response);
  if (!response.ok) throw new Error(result.error || "تعذّر رفع الملفات. أعد المحاولة.");
  return result.files;
}

async function sendWithRetry(url: string, body: Blob) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { method: "PUT", body, headers: { "Content-Type": "application/octet-stream" } });
      if (response.status >= 500 && attempt < 4) throw new Error("retry");
      return response;
    } catch (error) {
      if (attempt >= 4) throw error instanceof Error && error.message !== "retry" ? new Error("انقطع الاتصال أثناء رفع الملف. أعد المحاولة لاستكماله.") : new Error("تعذّر رفع الملف الآن. أعد المحاولة.");
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
}

async function chunkedUpload(file: File, ideaId: string, kind: Attachment["kind"], channel: Channel | undefined, onProgress?: Progress): Promise<Attachment | "fallback"> {
  const start = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ideaId, kind, channel, name: file.name, size: file.size, mime: file.type || "application/octet-stream" }) });
  const session = await json<{ uploadId: string; chunkSize: number; received: number }>(start);
  if (start.status === 409 && session.code === "DRIVE_NOT_CONNECTED") return "fallback";
  if (!start.ok) throw new Error(session.error || "تعذّر بدء رفع الملف.");
  let offset = session.received;
  for (;;) {
    const end = Math.min(offset + session.chunkSize, file.size);
    const response = await sendWithRetry(`/api/uploads/${session.uploadId}?offset=${offset}`, file.slice(offset, end));
    const result = await json<{ done: boolean; received?: number; attachment?: Attachment }>(response);
    if (response.status === 409 && result.code === "UPLOAD_OFFSET" && typeof result.current?.received === "number") { offset = result.current.received; continue; }
    if (!response.ok) throw new Error(result.error || "تعذّر رفع جزء من الملف.");
    if (result.done && result.attachment) { onProgress?.(file.size, file.size); return result.attachment; }
    offset = result.received ?? end;
    onProgress?.(offset, file.size);
  }
}

export async function uploadFiles(files: File[], ideaId: string, kind: Attachment["kind"], channel?: Channel, onProgress?: Progress): Promise<Attachment[]> {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let done = 0;
  const uploaded: Attachment[] = [];
  for (const [index, file] of files.entries()) {
    const result = await chunkedUpload(file, ideaId, kind, channel, (sent) => onProgress?.(done + sent, total));
    if (result === "fallback") return [...uploaded, ...await legacyUpload(files.slice(index), ideaId, kind, channel)];
    uploaded.push(result);
    done += file.size;
  }
  return uploaded;
}
