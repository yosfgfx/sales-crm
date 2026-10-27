import { randomUUID } from "node:crypto";
import { CHANNEL_LABELS, PRIORITY_LABELS, STATUS_LABELS, WORK_TYPE_LABELS, ideaCompanyIds, ideaCompanyLabel, type Idea, type MediaData } from "@/data/media";
import { database, type Queryable } from "./db";
import { readBlob } from "./blob-store";
import { createFolder, createGoogleDocFromHtml, deleteFile, DriveError, exportPdf, getFile, loadIntegration, moveFile, uploadWhole, type DriveFile } from "./google";
import { MediaServerError } from "./http";
import { insertNotifications, loadIdeas, loadReference } from "./repository";

export const IN_PROGRESS_FOLDER = "قيد التنفيذ";
export const SUBFOLDERS = { brief: "01 الموجز والمحتوى", quotation: "02 عروض الأسعار", final: "03 التصاميم النهائية" } as const;
const SUMMARY_NAME = "ملخص المشروع.pdf";
const MAX_ATTEMPTS = 6;
const STALLED_MESSAGE = "توقفت الأرشفة قبل اكتمالها عدة مرات. راجع حجم الملفات أو أعد المحاولة من إدارة النظام.";

const clean = (value: string) => value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "بدون عنوان";
export const projectFolderName = (idea: Pick<Idea, "code" | "workType" | "title">) => clean(`${idea.code} · ${WORK_TYPE_LABELS[idea.workType]} · ${idea.title}`);
export function monthFolderName(date: string) {
  const month = new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", month: "long", timeZone: "Asia/Riyadh" }).format(new Date(`${date.slice(0, 7)}-15T12:00:00Z`));
  return `${date.slice(5, 7)} - أعمال ${month}`;
}
export const companyFolderName = (shortName: string) => clean(`أعمال ${shortName}`);

async function rootFolder(q: Queryable) {
  const integration = await loadIntegration(q);
  if (!integration) throw new MediaServerError("لم يُربط Google Drive بعد. يربطه مالك النظام من الإعدادات.", 409, "DRIVE_NOT_CONNECTED");
  if (!integration.root_folder_id) throw new MediaServerError("لم يُحدَّد مجلد الأرشيف في Google Drive. يحدده مالك النظام أو مدير النظام من الإعدادات.", 409, "DRIVE_FOLDER_MISSING");
  return integration.root_folder_id;
}

async function stillThere(id: string, parent: string, q: Queryable) {
  try { const file = await getFile(id, q); return !file.trashed && (file.parents || []).includes(parent) ? file : null; }
  catch (error) { if (error instanceof DriveError && (error.status === 404 || error.status === 403)) return null; throw error; }
}

function withKeyLock<T>(key: string, operation: (tx: Queryable) => Promise<T>) {
  return database().transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtext($1))", [`wasl.drive:${key}`]);
    return operation(tx);
  });
}

export async function ensureFolder(key: string, parentId: string, name: string, root: string) {
  return withKeyLock(`folder:${key}`, async (tx) => {
    const cached = (await tx.query<{ folder_id: string }>("select folder_id from wasl.drive_folders where key = $1 and root_folder_id = $2", [key, root])).rows[0];
    if (cached && await stillThere(cached.folder_id, parentId, tx)) return cached.folder_id;
    const created = await createFolder(name, parentId, tx);
    await tx.query("insert into wasl.drive_folders (key, root_folder_id, folder_id, name) values ($1, $2, $3, $4) on conflict (key) do update set root_folder_id = excluded.root_folder_id, folder_id = excluded.folder_id, name = excluded.name, created_at = now()", [key, root, created.id, name]);
    return created.id;
  });
}

async function deliveredParent(idea: Idea, data: Pick<MediaData, "companies">, root: string) {
  const date = idea.deliveredAt || new Date().toISOString().slice(0, 10);
  const year = await ensureFolder(`year:${date.slice(0, 4)}`, root, date.slice(0, 4), root);
  const month = await ensureFolder(`month:${date.slice(0, 7)}`, year, monthFolderName(date), root);
  if (idea.allCompanies) return ensureFolder(`company:${date.slice(0, 7)}:*all`, month, clean("أعمال كل الشركات"), root);
  if (ideaCompanyIds(idea).length > 1) return ensureFolder(`company:${date.slice(0, 7)}:*shared`, month, clean("أعمال مشتركة بين الشركات"), root);
  const company = data.companies.find((item) => item.id === idea.companyId);
  return ensureFolder(`company:${date.slice(0, 7)}:${idea.companyId}`, month, companyFolderName(company?.shortName || company?.name || "أخرى"), root);
}

export async function ensureProjectFolders(ideaId: string, q: Queryable = database()) {
  const root = await rootFolder(q);
  const [idea] = await loadIdeas(q, { ids: [ideaId] });
  if (!idea) throw new MediaServerError("لم يتم العثور على الفكرة.", 404, "NOT_FOUND");
  const current = (await q.query<{ drive_folder_id: string | null }>("select drive_folder_id from wasl.ideas where id = $1", [ideaId])).rows[0]?.drive_folder_id;
  let project = current ? await getFile(current, q).catch(() => null) : null;
  if (!project || project.trashed) {
    const parent = idea.status === "delivered" ? await deliveredParent(idea, await loadReference(q), root) : await ensureFolder("in-progress", root, IN_PROGRESS_FOLDER, root);
    project = await withKeyLock(`project:${ideaId}`, async (tx) => {
      const latest = (await tx.query<{ drive_folder_id: string | null }>("select drive_folder_id from wasl.ideas where id = $1", [ideaId])).rows[0]?.drive_folder_id;
      if (latest && latest !== current) {
        const existing = await getFile(latest, tx).catch(() => null);
        if (existing && !existing.trashed) return existing;
      }
      const created = await createFolder(projectFolderName(idea), parent, tx);
      await tx.query("update wasl.ideas set drive_folder_id = $2 where id = $1", [ideaId, created.id]);
      await tx.query("delete from wasl.drive_folders where key like $1", [`project:${ideaId}:%`]);
      return created;
    });
  }
  const subfolders = {} as Record<keyof typeof SUBFOLDERS, string>;
  for (const [kind, name] of Object.entries(SUBFOLDERS) as [keyof typeof SUBFOLDERS, string][]) subfolders[kind] = await ensureFolder(`project:${ideaId}:${kind}`, project.id, name, root);
  return { root, project, subfolders, idea };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function summaryHtml(idea: Idea, data: Pick<MediaData, "members" | "companies" | "categories">) {
  const member = (id?: string) => data.members.find((item) => item.id === id)?.name || "—";
  const company = ideaCompanyLabel(idea, data.companies) || "—";
  const category = data.categories.find((item) => item.id === idea.categoryId)?.name || "—";
  const approval = [...idea.history].reverse().find((event) => event.action === "approved");
  const rows: [string, string][] = [
    ["الرمز", idea.code], ["العنوان", idea.title], ["الجهة", company], ["الإدارة", idea.department || "—"], ["التصنيف", category], ["نوع العمل", WORK_TYPE_LABELS[idea.workType]],
    ["القنوات", idea.channels.map((channel) => CHANNEL_LABELS[channel]).join("، ")], ["الأولوية", PRIORITY_LABELS[idea.priority]], ["الحالة", STATUS_LABELS[idea.status]],
    ["صاحب الفكرة", member(idea.ownerId)], ["المصمم", member(idea.designerId)], ["تاريخ الطلب", idea.requestedAt], ["موعد التسليم", idea.dueDate], ["تاريخ التسليم", idea.deliveredAt || "—"],
    ["اعتمدها", approval ? `${member(approval.actorId)} في ${approval.at.slice(0, 10)}` : "—"],
  ];
  const quotes = idea.quotations.map((quote) => `<tr><td>${escapeHtml(quote.vendor)}</td><td>${quote.amount.toLocaleString("en-US")} ر.س</td><td>${quote.days} يوم</td><td>${quote.recommended ? "موصى به" : ""}</td></tr>`).join("");
  const history = idea.history.map((event) => `<tr><td>${escapeHtml(event.at.slice(0, 16).replace("T", " "))}</td><td>${escapeHtml(member(event.actorId))}</td><td>${escapeHtml(event.note)}</td></tr>`).join("");
  const files = idea.attachments.map((file) => `<li>${escapeHtml(file.name)}${file.channel ? ` (${CHANNEL_LABELS[file.channel]})` : ""}</li>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(idea.code)}</title></head><body dir="rtl" style="font-family:Arial">
<h1>${escapeHtml(idea.title)}</h1><p>ملخص مشروع من نظام وصل</p>
<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">${rows.map(([label, value]) => `<tr><th style="text-align:right;width:30%">${label}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
<h2>الوصف</h2><p>${escapeHtml(idea.description).replace(/\n/g, "<br>")}</p>
<h2>النص</h2><p>${escapeHtml(idea.content).replace(/\n/g, "<br>")}</p>
<h2>خطة التنفيذ</h2><p>${escapeHtml(idea.executionPlan).replace(/\n/g, "<br>")}</p>
${quotes ? `<h2>عروض الأسعار</h2><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>المورد</th><th>المبلغ</th><th>المدة</th><th></th></tr>${quotes}</table>` : ""}
${files ? `<h2>الملفات</h2><ul>${files}</ul>` : ""}
<h2>سجل النشاط</h2><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>الوقت</th><th>العضو</th><th>الإجراء</th></tr>${history}</table>
</body></html>`;
}

async function uploadLocalAttachments(ideaId: string, subfolders: Record<keyof typeof SUBFOLDERS, string>, q: Queryable) {
  const rows = await q.query<{ id: string; name: string; mime: string; kind: keyof typeof SUBFOLDERS; local_path: string; storage: string }>("select id, name, mime, kind::text as kind, local_path, storage::text as storage from wasl.attachments where idea_id = $1 and removed_at is null and storage in ('local', 'supabase')", [ideaId]);
  for (const row of rows.rows) {
    const bytes = await readBlob(row.storage, row.local_path);
    const file = await uploadWhole({ name: row.name, parentId: subfolders[row.kind], mime: row.mime, bytes, appProperties: { waslAttachmentId: row.id } }, q);
    await q.query("update wasl.attachments set storage = 'drive', drive_file_id = $2, drive_parent_id = $3 where id = $1 and storage in ('local', 'supabase')", [row.id, file.id, subfolders[row.kind]]);
  }
  return rows.rows.length;
}

async function replaceSummary(idea: Idea, projectId: string, q: Queryable) {
  const reference = await loadReference(q);
  const doc = await createGoogleDocFromHtml(`${idea.code} ملخص مؤقت`, summaryHtml(idea, reference), projectId, q);
  try {
    const pdf = await exportPdf(doc.id, q);
    const previous = (await q.query<{ folder_id: string }>("select folder_id from wasl.drive_folders where key = $1", [`project:${idea.id}:summary`])).rows[0]?.folder_id;
    const uploaded = await uploadWhole({ name: SUMMARY_NAME, parentId: projectId, mime: "application/pdf", bytes: pdf, appProperties: { waslIdeaId: idea.id } }, q);
    await q.query("insert into wasl.drive_folders (key, root_folder_id, folder_id, name) values ($1, '-', $2, $3) on conflict (key) do update set folder_id = excluded.folder_id", [`project:${idea.id}:summary`, uploaded.id, SUMMARY_NAME]);
    if (previous) await deleteFile(previous, q).catch(() => undefined);
  } finally { await deleteFile(doc.id, q).catch(() => undefined); }
}

export async function archiveIdea(ideaId: string, q: Queryable = database()) {
  const { root, project, subfolders, idea } = await ensureProjectFolders(ideaId, q);
  if (idea.status !== "delivered") throw new MediaServerError("لا تُؤرشف الفكرة قبل تسليمها.", 409, "NOT_DELIVERED");
  await uploadLocalAttachments(ideaId, subfolders, q);
  const target = await deliveredParent(idea, await loadReference(q), root);
  const current: DriveFile = await getFile(project.id, q);
  if (!(current.parents || []).includes(target)) await moveFile(project.id, target, current.parents || [], q);
  const [fresh] = await loadIdeas(q, { ids: [ideaId] });
  await replaceSummary(fresh, project.id, q);
  return { folderId: project.id };
}

export async function enqueueArchive(q: Queryable, ideaId: string) {
  await q.query("update wasl.archive_jobs set status = 'done', updated_at = now() where idea_id = $1 and status in ('pending', 'failed')", [ideaId]);
  const id = randomUUID();
  await q.query("insert into wasl.archive_jobs (id, idea_id, kind) values ($1, $2, 'deliver')", [id, ideaId]);
  await q.query("update wasl.ideas set archive_status = 'pending' where id = $1", [ideaId]);
  return id;
}

async function escalateStalled(q: Queryable) {
  const stalled = (await q.query<{ id: string; idea_id: string }>(`update wasl.archive_jobs set status = 'needs_review', locked_until = null, last_error = $2, notified_failure = true, updated_at = now()
    where status = 'running' and locked_until < now() and attempts >= $1 and not notified_failure and exists(select 1 from wasl.ideas i where i.id = wasl.archive_jobs.idea_id and i.deleted_at is null and i.status = 'delivered') returning id, idea_id`, [MAX_ATTEMPTS, STALLED_MESSAGE])).rows;
  for (const job of stalled) {
    await q.query("update wasl.ideas set archive_status = 'needs_review' where id = $1", [job.idea_id]);
    await notifyAdmins(q, job.idea_id, "تعذّرت أرشفة عمل في Google Drive", STALLED_MESSAGE);
  }
}

async function claim(q: Queryable, jobId?: string) {
  await escalateStalled(q);
  const rows = await q.query<{ id: string; idea_id: string; attempts: number }>(`update wasl.archive_jobs set status = 'running', locked_until = now() + interval '5 minutes', attempts = attempts + 1, updated_at = now()
    where id = (select id from wasl.archive_jobs where ${jobId ? "id = $2 and" : ""} exists(select 1 from wasl.ideas i where i.id = wasl.archive_jobs.idea_id and i.deleted_at is null and i.status = 'delivered') and ((status in ('pending', 'failed') and next_run_at <= now()) or (status = 'running' and locked_until < now() and attempts < $1)) and (locked_until is null or locked_until < now()) order by next_run_at limit 1 for update skip locked)
    returning id, idea_id, attempts`, jobId ? [MAX_ATTEMPTS, jobId] : [MAX_ATTEMPTS]);
  return rows.rows[0] || null;
}

async function notifyAdmins(q: Queryable, ideaId: string, title: string, body: string) {
  const admins = (await q.query<{ id: string }>("select id from wasl.members where active and role in ('admin', 'superadmin', 'manager')")).rows;
  const now = new Date().toISOString();
  await insertNotifications(q, admins.map((admin) => ({ id: randomUUID(), recipientId: admin.id, ideaId, type: "archive" as never, title, body: `النظام · ${body}`, createdAt: now, read: false, actorName: "النظام", entityType: "idea", entityId: ideaId, action: "archive_failed" })));
}

export async function runArchiveJob(jobId?: string, q: Queryable = database()) {
  const job = await claim(q, jobId);
  if (!job) return null;
  await q.query("update wasl.ideas set archive_status = 'running' where id = $1", [job.idea_id]);
  const pauseDeleted = async () => {
    const record = (await q.query("select deleted_at, status::text as status from wasl.ideas where id=$1", [job.idea_id])).rows[0];
    if (!record || record.deleted_at || record.status !== "delivered") {
      await q.query("update wasl.archive_jobs set status='pending', locked_until=null, updated_at=now() where id=$1", [job.id]);
      return true;
    }
    return false;
  };
  try {
    if (await pauseDeleted()) return { id: job.id, status: "pending" as const };
    await archiveIdea(job.idea_id, q);
    const [idea] = await loadIdeas(q, { ids: [job.idea_id] });
    if (!idea || await pauseDeleted()) return { id: job.id, status: "pending" as const };
    const now = new Date().toISOString();
    await q.query("update wasl.archive_jobs set status = 'done', locked_until = null, last_error = null, updated_at = now() where id = $1", [job.id]);
    await q.query("update wasl.ideas set archive_status = 'done', archived_at = now() where id = $1", [job.idea_id]);
    const actor = (await loadIntegration(q))?.connected_by || idea.ownerId;
    await q.query("insert into wasl.idea_events (id, idea_id, at, actor_id, action, note) values ($1, $2, now(), $3, 'archived', 'أُرشف العمل في Google Drive تلقائياً')", [randomUUID(), job.idea_id, actor]);
    const managers = (await q.query<{id:string}>("select id from wasl.members where active and role in ('manager', 'admin', 'superadmin')")).rows.map((member) => member.id);
    await insertNotifications(q, [...new Set([idea.ownerId, idea.designerId, ...managers].filter(Boolean))].map((recipientId) => ({ id: randomUUID(), recipientId, ideaId: idea.id, type: "archive" as never, title: "أُرشف العمل في Google Drive", body: `النظام · أُرشف ${idea.title} في Google Drive`, createdAt: now, read: false, actorId: actor, actorName: "النظام", entityType: "idea", entityId: idea.id, action: "archived" })));
    return { id: job.id, status: "done" as const };
  } catch (error) {
    if (await pauseDeleted()) return { id: job.id, status: "pending" as const };
    const message = error instanceof MediaServerError ? error.message : "تعذّرت الأرشفة لسبب غير متوقع.";
    const finalFailure = job.attempts >= MAX_ATTEMPTS || (error instanceof MediaServerError && ["DRIVE_NOT_CONNECTED", "DRIVE_FOLDER_MISSING", "DRIVE_REAUTH_REQUIRED", "DRIVE_STORAGE_QUOTA"].includes(error.code));
    const status = finalFailure ? "needs_review" : "failed";
    const delayMinutes = Math.min(2 ** job.attempts, 120);
    const updated = await q.query<{ notified_failure: boolean }>(`update wasl.archive_jobs set status = $2, locked_until = null, last_error = $3, next_run_at = now() + ($4 || ' minutes')::interval, updated_at = now() where id = $1 returning notified_failure`, [job.id, status, message, String(delayMinutes)]);
    await q.query("update wasl.ideas set archive_status = $2 where id = $1", [job.idea_id, finalFailure ? "needs_review" : "failed"]);
    if (finalFailure && !updated.rows[0]?.notified_failure) {
      await notifyAdmins(q, job.idea_id, "تعذّرت أرشفة عمل في Google Drive", message);
      await q.query("update wasl.archive_jobs set notified_failure = true where id = $1", [job.id]);
    }
    return { id: job.id, status, error: message };
  }
}

export async function runDueArchiveJobs(limit = 5, q: Queryable = database()) {
  const results = [];
  for (let index = 0; index < limit; index++) { const result = await runArchiveJob(undefined, q); if (!result) break; results.push(result); }
  return results;
}

export async function retryArchive(ideaId: string, q: Queryable = database()) {
  await q.query("update wasl.archive_jobs set status = 'failed', next_run_at = now(), attempts = 0, notified_failure = false, locked_until = null where idea_id = $1 and (status in ('failed', 'needs_review') or (status = 'running' and locked_until < now()))", [ideaId]);
  let job = (await q.query<{ id: string }>("select id from wasl.archive_jobs where idea_id = $1 and status in ('pending', 'failed') order by created_at desc limit 1", [ideaId])).rows[0];
  if (!job) {
    const delivered = (await q.query("select 1 from wasl.ideas where id = $1 and status = 'delivered'", [ideaId])).rows.length > 0;
    const running = (await q.query("select 1 from wasl.archive_jobs where idea_id = $1 and status = 'running'", [ideaId])).rows.length > 0;
    if (!delivered || running) return null;
    job = { id: await enqueueArchive(q, ideaId) };
  }
  return runArchiveJob(job.id, q);
}
