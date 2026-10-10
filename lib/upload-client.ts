import type { Attachment, Channel } from "@/data/media";
import { apiRequest, postJson } from "@/lib/api-client";
import { WorkflowError } from "@/lib/media-workflow";

type Progress = (sent: number, total: number) => void;

async function legacyUpload(files: File[], ideaId: string, kind: Attachment["kind"], channel?: Channel): Promise<Attachment[]> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  form.set("ideaId", ideaId);
  form.set("kind", kind);
  if (channel) form.set("channel", channel);
  return (await apiRequest<{ files: Attachment[] }>("/api/files", { method: "POST", body: form })).files;
}

async function sendChunk(url: string, body: Blob) {
  for (let attempt = 1; ; attempt++) {
    try { return await apiRequest<{ done: boolean; received?: number; attachment?: Attachment }>(url, { method: "PUT", body, headers: { "Content-Type": "application/octet-stream" } }); }
    catch (error) {
      const retryable = error instanceof WorkflowError && (error.status === 0 || error.status >= 500);
      if (!retryable || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
}

async function chunkedUpload(file: File, ideaId: string, kind: Attachment["kind"], channel: Channel | undefined, onProgress?: Progress): Promise<Attachment | "fallback"> {
  let session: { uploadId: string; chunkSize: number; received: number };
  try { session = await postJson("/api/uploads", { ideaId, kind, channel, name: file.name, size: file.size, mime: file.type || "application/octet-stream" }); }
  catch (error) { if (error instanceof WorkflowError && error.code === "DRIVE_NOT_CONNECTED") return "fallback"; throw error; }
  let offset = session.received;
  for (;;) {
    const end = Math.min(offset + session.chunkSize, file.size);
    let result: { done: boolean; received?: number; attachment?: Attachment };
    try { result = await sendChunk(`/api/uploads/${session.uploadId}?offset=${offset}`, file.slice(offset, end)); }
    catch (error) {
      const current = (error as { current?: { received?: number } }).current;
      if (error instanceof WorkflowError && error.code === "UPLOAD_OFFSET" && typeof current?.received === "number") { offset = current.received; continue; }
      throw error;
    }
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
