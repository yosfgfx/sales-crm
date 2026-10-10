import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Attachment, TeamMember } from "@/data/media";
import { isAdministrator, requireUser } from "./auth";
import { database } from "./db";
import { assertSameOrigin, limitedBody, MediaServerError, responseHeaders } from "./http";
import { loadIdeas, toAttachment } from "./repository";
import { canSeeQuotations } from "./state";

const FILE_LIMIT = 25 * 1024 * 1024;
const UPLOAD_LIMIT = 100 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

export function dataDirectory() {
  const directory = process.env.MEDIA_DATA_DIR;
  if (directory) {
    if (!path.isAbsolute(directory)) throw new MediaServerError("يجب أن يكون مسار حفظ الملفات على الخادم مساراً كاملاً.", 503, "STORAGE_CONFIGURATION");
    return directory;
  }
  return path.join(process.cwd(), ".media-data");
}
const fileDirectory = () => path.join(dataDirectory(), "files");

export function sniffInlineMime(bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, 16));
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (head[0] === 255 && head[1] === 216 && head[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(head.subarray(0, 6).toString())) return "image/gif";
  if (head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (head.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (head.subarray(4, 8).toString() === "ftyp") {
    const brand = head.subarray(8, 12).toString();
    if (["avif", "avis"].includes(brand)) return "image/avif";
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(brand)) return "video/mp4";
  }
  return null;
}

export function safeFilename(name: string) {
  return path.basename(name.replaceAll("\\", "/")).replace(/[\u0000-\u001f\u007f]/g, "").replace(/[<>:"|?*]/g, "_").slice(0, 240).trim() || "مرفق";
}

function assertUploadAllowed(actor: TeamMember, kind: string, idea: { status: string; ownerId: string; designerId: string; channels: string[] } | undefined, channel: string | null) {
  if (kind === "logo") { if (!isAdministrator(actor)) throw new MediaServerError("تغيير شعار الإدارة متاح لمدير النظام فقط.", 403, "FILE_PERMISSION"); return; }
  if (!idea) throw new MediaServerError("لم يتم العثور على الفكرة.", 404, "NOT_FOUND");
  if (kind === "final") {
    if (!["scheduled", "designing", "design_review"].includes(idea.status) || !channel || !idea.channels.includes(channel) || (!isAdministrator(actor) && (actor.role !== "designer" || idea.designerId !== actor.id))) throw new MediaServerError("إرفاق النسخ النهائية متاح للمصمم المكلّف بعد جدولة الفكرة، وللقنوات المطلوبة فقط.", 403, "FILE_PERMISSION");
  } else if (!["draft", "quotations", "changes"].includes(idea.status) || (!isAdministrator(actor) && (actor.role !== "content" || idea.ownerId !== actor.id))) {
    throw new MediaServerError("إضافة مرفقات المحتوى متاحة لمسؤول الفكرة أثناء إعدادها أو تعديلها.", 403, "FILE_PERMISSION");
  }
}

export async function uploadFiles(request: Request): Promise<Attachment[]> {
  assertSameOrigin(request);
  const db = database();
  const actor = await requireUser(request, db);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) throw new MediaServerError("اختر الملفات لإرفاقها.", 415, "INVALID_CONTENT_TYPE");
  const body = await limitedBody(request, UPLOAD_LIMIT + 1024 * 1024);
  let form: FormData;
  try { form = await new Response(body as BodyInit, { headers: { "Content-Type": contentType } }).formData(); } catch { throw new MediaServerError("تعذّر قراءة الملفات. اخترها مجدداً."); }
  const kind = String(form.get("kind") || "");
  const ideaId = form.get("ideaId");
  const channel = form.get("channel") ? String(form.get("channel")) : null;
  const isLogo = kind === "logo";
  if (!["brief", "quotation", "final", "logo"].includes(kind) || (!isLogo && (typeof ideaId !== "string" || !ID_PATTERN.test(ideaId))) || (channel && !["screens", "whatsapp", "email"].includes(channel)) || (kind !== "final" && channel)) throw new MediaServerError("بيانات المرفق غير مكتملة.");
  const idea = isLogo ? undefined : (await loadIdeas(db, { ids: [String(ideaId)] }))[0];
  assertUploadAllowed(actor, kind, idea, channel);
  const files = form.getAll("files");
  if (files.length < 1 || files.length > (isLogo ? 1 : 10) || files.some((file) => typeof file === "string")) throw new MediaServerError(isLogo ? "اختر صورة شعار واحدة." : "يمكن إرفاق من ملف واحد إلى ١٠ ملفات في كل مرة.");
  let total = 0;
  for (const file of files as File[]) { total += file.size; if (file.size === 0 || file.size > (isLogo ? 5 * 1024 * 1024 : FILE_LIMIT)) throw new MediaServerError(isLogo ? "يجب ألا يتجاوز حجم الشعار ٥ ميجابايت، وألا يكون فارغاً." : "يجب ألا يتجاوز حجم كل ملف ٢٥ ميجابايت، وألا يكون فارغاً.", 413, "FILE_TOO_LARGE"); }
  if (total > UPLOAD_LIMIT) throw new MediaServerError("الحد الإجمالي لملفات الدفعة هو ١٠٠ ميجابايت.", 413, "UPLOAD_TOO_LARGE");
  await mkdir(fileDirectory(), { recursive: true, mode: 0o700 });
  const created: string[] = [];
  try {
    const rows: { id: string; name: string; size: number; mime: string; inline: string | null; sha256: string }[] = [];
    for (const file of files as File[]) {
      const id = randomUUID();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const inline = sniffInlineMime(bytes);
      if (isLogo && !inline?.startsWith("image/")) throw new MediaServerError("اختر شعاراً بصيغة PNG أو JPEG أو GIF أو WebP أو AVIF.", 422, "INVALID_LOGO_TYPE");
      await writeFile(path.join(fileDirectory(), `${id}.blob`), bytes, { flag: "wx", mode: 0o600 });
      created.push(id);
      rows.push({ id, name: safeFilename(file.name), size: file.size, mime: inline || "application/octet-stream", inline, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    return await db.transaction(async (tx) => {
      const result: Attachment[] = [];
      for (const row of rows) {
        const inserted = await tx.query(`insert into wasl.attachments (id, requested_idea_id, kind, channel, name, size, mime, storage, local_path, inline_mime, sha256, owner_id)
          values ($1, $2, $3::wasl.attachment_kind, $4::wasl.channel, $5, $6, $7, 'local', $8, $9, $10, $11) returning id, kind::text as kind, channel::text as channel, name, size, mime, storage::text as storage, external_url, inline_mime, created_at`,
          [row.id, isLogo ? null : ideaId, kind, channel, row.name, row.size, row.mime, `${row.id}.blob`, row.inline, row.sha256, actor.id]);
        result.push(toAttachment(inserted.rows[0]));
      }
      return result;
    });
  } catch (error) {
    await Promise.all(created.map((id) => rm(path.join(fileDirectory(), `${id}.blob`), { force: true })));
    throw error;
  }
}

export async function downloadFile(request: Request, id: string): Promise<Response> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new MediaServerError("الملف غير موجود.", 404, "FILE_NOT_FOUND");
  const db = database();
  const actor = await requireUser(request, db);
  const row = (await db.query("select a.id, a.name, a.kind::text as kind, a.local_path, a.inline_mime, a.owner_id, a.idea_id, a.requested_idea_id, a.removed_at, i.owner_id as idea_owner from wasl.attachments a left join wasl.ideas i on i.id = coalesce(a.idea_id, a.requested_idea_id) where a.id = $1 and a.storage = 'local'", [id])).rows[0];
  if (!row) throw new MediaServerError("الملف غير موجود.", 404, "FILE_NOT_FOUND");
  const ownUpload = row.owner_id === actor.id;
  const visible = row.kind === "logo" || ownUpload || isAdministrator(actor) || (row.idea_id && !row.removed_at && (row.kind !== "quotation" || canSeeQuotations(actor, { ownerId: String(row.idea_owner) })));
  if (!visible) throw new MediaServerError("ليس لديك صلاحية الوصول لهذا الملف.", 403, "FILE_PERMISSION");
  let bytes: Buffer;
  try { bytes = await readFile(path.join(fileDirectory(), path.basename(String(row.local_path)))); } catch { throw new MediaServerError("تعذّر العثور على الملف المحفوظ. تواصل مع المسؤول.", 404, "FILE_NOT_FOUND"); }
  const inline = new URL(request.url).searchParams.get("inline") === "1" && Boolean(row.inline_mime);
  const name = encodeURIComponent(String(row.name)).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(bytes), { headers: { ...responseHeaders, "Content-Type": inline ? String(row.inline_mime) : "application/octet-stream", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="attachment"; filename*=UTF-8''${name}`, "Content-Length": String(bytes.length), "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } });
}
