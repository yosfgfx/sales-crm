import { randomUUID } from "node:crypto";
import type { TeamMember } from "@/data/media";
import { ensureProjectFolders } from "./archive";
import type { Queryable } from "./db";
import { DriveError, FOLDER_MIME, getFile, moveFile, untrashFile, type DriveFile } from "./google";
import { MediaServerError } from "./http";

type Problem = "missing" | "trashed" | "moved";
const KIND_TO_FOLDER = { brief: "brief", quotation: "quotation", final: "final" } as const;

async function lookup(id: string, q: Queryable): Promise<DriveFile | null> {
  try { return await getFile(id, q); }
  catch (error) { if (error instanceof DriveError && (error.status === 404 || error.status === 403)) return null; throw error; }
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

export async function repairAttachment(input: { attachmentId: string; mode: string; fileId?: string }, actor: TeamMember, q: Queryable) {
  const row = (await q.query<{ id: string; name: string; kind: keyof typeof KIND_TO_FOLDER; idea_id: string; drive_file_id: string }>(
    "select id, name, kind::text as kind, idea_id, drive_file_id from wasl.attachments where id = $1 and storage = 'drive' and removed_at is null and idea_id is not null", [input.attachmentId])).rows[0];
  if (!row) throw new MediaServerError("لم يُعثر على الملف المؤرشف.", 404, "NOT_FOUND");
  const event = (note: string, action = "archived") => q.query("insert into wasl.idea_events (id, idea_id, at, actor_id, action, note) values ($1, $2, now(), $3, $4, $5)", [randomUUID(), row.idea_id, actor.id, action, note]);
  if (input.mode === "restore") {
    const file = await untrashFile(row.drive_file_id, q);
    await q.query("update wasl.attachments set drive_parent_id = coalesce($2, drive_parent_id) where id = $1", [row.id, file.parents?.[0] || null]);
    await event(`استُعيد الملف «${row.name}» من سلة Google Drive`);
    return { ok: true };
  }
  if (input.mode === "relink") {
    if (!input.fileId || !/^[A-Za-z0-9_-]{10,200}$/.test(input.fileId)) throw new MediaServerError("اختر الملف البديل من Google Drive.");
    const replacement = await lookup(input.fileId, q);
    if (!replacement || replacement.trashed || replacement.mimeType === FOLDER_MIME) throw new MediaServerError("الملف المختار غير متاح للنظام أو هو مجلد. اختر ملفاً آخر.", 422, "INVALID_REPLACEMENT");
    const { subfolders } = await ensureProjectFolders(row.idea_id, q);
    const target = subfolders[KIND_TO_FOLDER[row.kind] || "brief"];
    const moved = (replacement.parents || []).includes(target) ? replacement : await moveFile(replacement.id, target, replacement.parents || [], q);
    await q.query("update wasl.attachments set drive_file_id = $2, drive_parent_id = $3, size = coalesce($4, size) where id = $1", [row.id, moved.id, target, moved.size ? Number(moved.size) : null]);
    await event(`أُعيد ربط الملف «${row.name}» بملف بديل في Google Drive`);
    return { ok: true };
  }
  if (input.mode === "ignore") {
    await q.query("update wasl.attachments set removed_at = now() where id = $1", [row.id]);
    await event(`أُزيل «${row.name}» من الفكرة لأنه فُقد من Google Drive`, "attachment_removed");
    return { ok: true };
  }
  throw new MediaServerError("إجراء غير معروف.");
}
