import { randomUUID } from "node:crypto";
import type { Attachment } from "@/data/media";
import { ensureProjectFolders } from "./archive";
import { requireUser } from "./auth";
import { decryptSecret, encryptSecret } from "./crypto";
import { database } from "./db";
import { assertUploadAllowed, safeFilename, sniffInlineMime } from "./files";
import { loadIntegration, sendChunk, startResumable, uploadedBytes } from "./google";
import { assertSameOrigin, limitedBody, MediaServerError, readJson } from "./http";
import { loadIdeas, toAttachment } from "./repository";

export const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_FILE = 2 * 1024 * 1024 * 1024;

type Session = { id: string; idea_id: string; kind: string; channel: string | null; name: string; size: string | number; mime: string; owner_id: string; session_uri_enc: string; received: string | number; inline_mime: string | null; status: string; attachment_id: string | null };

export async function startUpload(request: Request) {
  assertSameOrigin(request);
  const db = database();
  const actor = await requireUser(request, db);
  const body = await readJson(request, 4096) as Record<string, unknown> | null;
  const ideaId = String(body?.ideaId || ""), kind = String(body?.kind || ""), channel = body?.channel ? String(body.channel) : null;
  const size = Number(body?.size), name = safeFilename(String(body?.name || ""));
  const mime = typeof body?.mime === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(body.mime) ? body.mime : "application/octet-stream";
  if (!["brief", "quotation", "final"].includes(kind) || !/^[A-Za-z0-9_-]{1,100}$/.test(ideaId) || (channel && !["screens", "whatsapp", "email"].includes(channel)) || (kind !== "final" && channel)) throw new MediaServerError("بيانات المرفق غير مكتملة.");
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE) throw new MediaServerError("يجب ألا يتجاوز حجم الملف ٢ جيجابايت، وألا يكون فارغاً.", 413, "FILE_TOO_LARGE");
  const integration = await loadIntegration(db);
  if (!integration?.root_folder_id) throw new MediaServerError("سيُحفظ الملف على الخادم مؤقتاً لأن Google Drive لم يُربط بعد.", 409, "DRIVE_NOT_CONNECTED");
  const [idea] = await loadIdeas(db, { ids: [ideaId] });
  assertUploadAllowed(actor, kind, idea, channel);
  const { subfolders } = await ensureProjectFolders(ideaId, db);
  const id = randomUUID();
  const parentId = subfolders[kind as keyof typeof subfolders];
  const sessionUri = await startResumable({ name, parentId, mime, size, appProperties: { waslUploadId: id, waslIdeaId: ideaId } }, db);
  await db.query("insert into wasl.upload_sessions (id, idea_id, kind, channel, name, size, mime, owner_id, session_uri_enc) values ($1, $2, $3::wasl.attachment_kind, $4::wasl.channel, $5, $6, $7, $8, $9)", [id, ideaId, kind, channel, name, size, mime, actor.id, encryptSecret(sessionUri)]);
  return { uploadId: id, chunkSize: CHUNK_SIZE, received: 0 };
}

async function ownedSession(request: Request, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new MediaServerError("جلسة الرفع غير موجودة.", 404, "UPLOAD_NOT_FOUND");
  const db = database();
  const actor = await requireUser(request, db);
  const session = (await db.query<Session>("select * from wasl.upload_sessions where id = $1 and expires_at > now()", [id])).rows[0];
  if (!session || session.owner_id !== actor.id) throw new MediaServerError("جلسة الرفع غير موجودة أو انتهت. ابدأ رفع الملف مجدداً.", 404, "UPLOAD_NOT_FOUND");
  return { db, session };
}

async function finish(id: string, session: Session, file: { id: string; parents?: string[] }): Promise<Attachment> {
  const db = database();
  return db.transaction(async (tx) => {
    const existing = (await tx.query<Session>("select * from wasl.upload_sessions where id = $1 for update", [id])).rows[0];
    if (existing.attachment_id) {
      const row = (await tx.query("select id, kind::text as kind, channel::text as channel, name, size, mime, storage::text as storage, external_url, inline_mime, created_at from wasl.attachments where id = $1", [existing.attachment_id])).rows[0];
      return toAttachment(row);
    }
    const attachmentId = randomUUID();
    const row = (await tx.query(`insert into wasl.attachments (id, requested_idea_id, kind, channel, name, size, mime, storage, drive_file_id, drive_parent_id, inline_mime, owner_id)
      values ($1, $2, $3::wasl.attachment_kind, $4::wasl.channel, $5, $6, $7, 'drive', $8, $9, $10, $11) returning id, kind::text as kind, channel::text as channel, name, size, mime, storage::text as storage, external_url, inline_mime, created_at`,
    [attachmentId, session.idea_id, session.kind, session.channel, session.name, session.size, session.inline_mime || session.mime, file.id, file.parents?.[0] || null, session.inline_mime, session.owner_id])).rows[0];
    await tx.query("update wasl.upload_sessions set status = 'done', received = size, attachment_id = $2 where id = $1", [id, attachmentId]);
    return toAttachment(row);
  });
}

export async function putChunk(request: Request, id: string) {
  assertSameOrigin(request);
  const { db, session } = await ownedSession(request, id);
  if (session.status === "done" && session.attachment_id) return { done: true, attachment: await finish(id, session, { id: "" }) };
  const offset = Number(new URL(request.url).searchParams.get("offset"));
  const total = Number(session.size), received = Number(session.received);
  if (offset !== received) throw new MediaServerError("ترتيب أجزاء الملف غير صحيح. سيكمل النظام من آخر جزء محفوظ.", 409, "UPLOAD_OFFSET", { received });
  const bytes = await limitedBody(request, CHUNK_SIZE);
  if (!bytes.length || (offset + bytes.length < total && bytes.length % (256 * 1024) !== 0) || offset + bytes.length > total) throw new MediaServerError("حجم جزء الملف غير صالح.", 422, "UPLOAD_CHUNK_INVALID");
  if (offset === 0) await db.query("update wasl.upload_sessions set inline_mime = $2 where id = $1", [id, sniffInlineMime(bytes)]);
  const result = await sendChunk(decryptSecret(session.session_uri_enc), bytes, offset, total);
  if (result.done) {
    const fresh = (await db.query<Session>("select * from wasl.upload_sessions where id = $1", [id])).rows[0];
    return { done: true, attachment: await finish(id, fresh, result.file) };
  }
  await db.query("update wasl.upload_sessions set received = $2 where id = $1", [id, result.received]);
  return { done: false, received: result.received };
}

export async function uploadStatus(request: Request, id: string) {
  const { db, session } = await ownedSession(request, id);
  if (session.status === "done") return { done: true, received: Number(session.size) };
  const received = await uploadedBytes(decryptSecret(session.session_uri_enc), Number(session.size));
  await db.query("update wasl.upload_sessions set received = $2 where id = $1", [id, received]);
  return { done: false, received };
}
