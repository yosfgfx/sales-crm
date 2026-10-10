import { randomUUID } from "node:crypto";
import type { TeamMember } from "@/data/media";
import { ensureProjectFolders } from "./archive";
import { database, type Queryable } from "./db";
import { DriveError, getFile, getFileDetails, moveFile, untrashFile, type DriveFile } from "./google";
import { MediaServerError } from "./http";
import { lockIdea } from "./repository";

type Problem = "missing" | "trashed" | "moved";
const KIND_TO_FOLDER = { brief: "brief", quotation: "quotation", final: "final" } as const;
const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
const APP_MARKERS = ["waslAttachmentId", "waslIdeaId", "waslBackup"];

async function lookup(id: string, q: Queryable): Promise<DriveFile | null> {
  try { return await getFile(id, q); }
  catch (error) { if (error instanceof DriveError && (error.code === "DRIVE_NOT_FOUND" || error.code === "DRIVE_FORBIDDEN")) return null; throw error; }
}

export async function scanArchive(ideaId: string, q: Queryable) {
  const idea = (await q.query<{ drive_folder_id: string | null }>("select drive_folder_id from wasl.ideas where id = $1", [ideaId])).rows[0];
  if (!idea) throw new MediaServerError("لم يتم العثور على الفكرة.", 404, "NOT_FOUND");
  const folder = idea.drive_folder_id ? await lookup(idea.drive_folder_id, q) : null;
  const rows = (await q.query<{ id: string; name: string; kind: string; drive_file_id: string; drive_parent_id: string | null }>(
    "select id, name, kind::text as kind, drive_file_id, drive_parent_id from wasl.attachments where idea_id = $1 and removed_at is null and storage = 'drive' order by created_at", [ideaId])).rows;
  const files: { attachmentId: string; name: string; kind: string; problem: Problem }[] = [];
  for (const row of rows) {
    const file = await lookup(row.drive_file_id, q);
    const problem: Problem | null = !file ? "missing" : file.trashed ? "trashed" : row.drive_parent_id && !(file.parents || []).includes(row.drive_parent_id) ? "moved" : null;
    if (problem) files.push({ attachmentId: row.id, name: row.name, kind: row.kind, problem });
  }
  return { projectFolder: !idea.drive_folder_id ? "none" as const : !folder || folder.trashed ? "missing" as const : "ok" as const, checked: rows.length, files };
}

async function replacementFor(fileId: string | undefined, q: Queryable) {
  if (!fileId || !/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw new MediaServerError("اختر الملف البديل من Google Drive.");
  const invalid = () => new MediaServerError("لا يمكن استخدام هذا الملف بديلاً. اختر ملفاً رفعته بنفسك إلى Drive، لا ملفاً من أرشيف النظام أو مستند Google.", 422, "INVALID_REPLACEMENT");
  const inUse = (await q.query("select 1 from wasl.attachments where drive_file_id = $1 union all select 1 from wasl.drive_folders where folder_id = $1 limit 1", [fileId])).rows.length > 0;
  if (inUse) throw invalid();
  let file: Awaited<ReturnType<typeof getFileDetails>>;
  try { file = await getFileDetails(fileId, q); }
  catch (error) { if (error instanceof DriveError && (error.code === "DRIVE_NOT_FOUND" || error.code === "DRIVE_FORBIDDEN")) throw invalid(); throw error; }
  if (file.trashed || file.mimeType.startsWith("application/vnd.google-apps.") || APP_MARKERS.some((key) => file.appProperties?.[key])) throw invalid();
  return file;
}

export async function repairAttachment(input: { attachmentId: string; mode: string; fileId?: string }, actor: TeamMember, q: Queryable = database()) {
  const row = (await q.query<{ id: string; name: string; kind: keyof typeof KIND_TO_FOLDER; idea_id: string; drive_file_id: string }>(
    "select id, name, kind::text as kind, idea_id, drive_file_id from wasl.attachments where id = $1 and storage = 'drive' and removed_at is null and idea_id is not null", [input.attachmentId])).rows[0];
  if (!row) throw new MediaServerError("لم يُعثر على الملف المؤرشف.", 404, "NOT_FOUND");
  if (!["restore", "relink", "ignore"].includes(input.mode)) throw new MediaServerError("إجراء غير معروف.");
  let drive: { parentId?: string | null; replacement?: DriveFile } = {};
  if (input.mode === "restore") drive = { parentId: (await untrashFile(row.drive_file_id, q)).parents?.[0] || null };
  if (input.mode === "relink") {
    const replacement = await replacementFor(input.fileId, q);
    const { subfolders } = await ensureProjectFolders(row.idea_id, q);
    const target = subfolders[KIND_TO_FOLDER[row.kind] || "brief"];
    drive = { parentId: target, replacement: (replacement.parents || []).includes(target) ? replacement : await moveFile(replacement.id, target, replacement.parents || [], q) };
  }
  return database().transaction(async (tx) => {
    await lockIdea(tx, row.idea_id);
    const current = (await tx.query("select 1 from wasl.attachments where id = $1 and removed_at is null and drive_file_id = $2", [row.id, row.drive_file_id])).rows.length;
    if (!current) throw new MediaServerError("تغيّر هذا الملف أثناء الإصلاح. أعد الفحص.", 409, "REPAIR_CONFLICT");
    const event = (note: string, action = "archived") => tx.query("insert into wasl.idea_events (id, idea_id, at, actor_id, action, note) values ($1, $2, now(), $3, $4, $5)", [randomUUID(), row.idea_id, actor.id, action, note]);
    if (input.mode === "restore") {
      await tx.query("update wasl.attachments set drive_parent_id = coalesce($2, drive_parent_id) where id = $1", [row.id, drive.parentId]);
      await event(`استُعيد الملف «${row.name}» من سلة Google Drive`);
    } else if (input.mode === "relink") {
      const file = drive.replacement!;
      await tx.query("update wasl.attachments set drive_file_id = $2, drive_parent_id = $3, name = $4, mime = $5, inline_mime = $6, size = coalesce($7, size), sha256 = null where id = $1",
        [row.id, file.id, drive.parentId, file.name.slice(0, 255), file.mimeType, INLINE.has(file.mimeType) ? file.mimeType : null, file.size ? Number(file.size) : null]);
      await event(`أُعيد ربط «${row.name}» بالملف البديل «${file.name}» في Google Drive`);
    } else {
      const quotes = (await tx.query<{ vendor: string }>("update wasl.quotations set attachment_id = null where attachment_id = $1 returning vendor", [row.id])).rows;
      await tx.query("update wasl.attachments set removed_at = now() where id = $1", [row.id]);
      await event(`أُزيل «${row.name}» من الفكرة لأنه فُقد من Google Drive${quotes.length ? "، وبقي عرض السعر دون ملف" : ""}`, "attachment_removed");
    }
    await tx.query("update wasl.ideas set updated_at = now() where id = $1", [row.idea_id]);
    return { ok: true };
  });
}
