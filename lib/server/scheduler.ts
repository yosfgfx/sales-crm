import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import type { MediaNotification } from "@/data/media";
import { runDueArchiveJobs } from "./archive";
import { deleteBlob } from "./blob-store";
import { deleteFile, loadIntegration, uploadWhole } from "./google";
import { ensureFolder } from "./archive";
import { BACKUP_EXTENSION, createBackup } from "../../scripts/lib/backup.mjs";
import { database, type Queryable } from "./db";
import { insertNotifications } from "./repository";
import { announceHonor, runMeetingReminders } from "./engagement";
import { runTaskReminders } from "./tasks";
import { flushPushOutbox } from "./push";

const ACTIVE = ["draft", "quotations", "review", "changes", "approved", "scheduled", "designing", "design_review"];
const DESIGN = ["approved", "scheduled", "designing", "design_review"];
let lastRun = 0;
let transport: Transporter | null = null;

export const riyadhDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(date);
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

export async function runDailyJobs(q: Queryable = database(), today = riyadhDate()) {
  const claimed = await q.query("insert into wasl.job_runs (key) values ($1) on conflict (key) do nothing returning key", [`daily:${today}`]);
  if (!claimed.rows.length) return { ran: false, reminders: 0 };
  const managers = (await q.query<{ id: string }>("select id from wasl.members where active and role = 'manager'")).rows.map((row) => row.id);
  const due = (await q.query<{ id: string; title: string; status: string; owner_id: string; designer_id: string | null; due_date: string }>(
    "select id, title, status::text as status, owner_id, designer_id, due_date::text as due_date from wasl.ideas where deleted_at is null and status::text = any($1::text[]) and due_date <= $2::date", [ACTIVE, addDays(today, 2)])).rows;
  const notices: MediaNotification[] = [];
  const createdAt = new Date().toISOString();
  for (const idea of due) {
    const responsible = DESIGN.includes(idea.status) && idea.designer_id ? idea.designer_id : idea.owner_id;
    if (idea.due_date === addDays(today, 2)) {
      const sent = await q.query("insert into wasl.reminders (idea_id, kind, sent_on) values ($1, 'due_soon', $2) on conflict do nothing returning 1", [idea.id, today]);
      if (sent.rows.length) notices.push({ id: randomUUID(), recipientId: responsible, ideaId: idea.id, type: "reminder", title: "موعد التسليم بعد يومين", body: idea.title, createdAt, read: false });
    }
    const daysLate = Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${idea.due_date}T00:00:00Z`).getTime()) / 86_400_000);
    if (daysLate >= 1 && idea.status !== "draft" && (daysLate === 1 || daysLate % 3 === 1)) {
      const sent = await q.query("insert into wasl.reminders (idea_id, kind, sent_on) values ($1, 'overdue', $2) on conflict do nothing returning 1", [idea.id, today]);
      if (sent.rows.length) for (const recipientId of new Set([responsible, ...managers])) notices.push({ id: randomUUID(), recipientId, ideaId: idea.id, type: "reminder", title: `عمل متأخر ${daysLate} يوم`, body: idea.title, createdAt, read: false });
    }
  }
  await insertNotifications(q, notices);
  const cleaned = await cleanupFiles(q);
  await q.query("delete from wasl.notifications where read_at < now() - interval '90 days'");
  await q.query("delete from wasl.oauth_codes where expires_at < now() - interval '1 day'");
  await q.query("delete from wasl.api_keys where greatest(expires_at, coalesce(refresh_expires_at, expires_at), coalesce(revoked_at, expires_at)) < now() - interval '30 days'");
  await q.query("delete from wasl.oauth_clients c where c.last_used_at is null and c.created_at < now() - interval '1 hour' and not exists (select 1 from wasl.api_keys k where k.client_id = c.client_id)");
  await q.query("delete from wasl.api_audit where at < now() - interval '180 days'");
  return { ran: true, reminders: notices.length, cleaned };
}

export async function runDailyBackup(q: Queryable = database(), today = riyadhDate(), now = new Date()) {
  if ((await q.query("select 1 from wasl.job_runs where key = $1", [`backup:${today}`])).rows.length) return { ran: false, reason: "done" as const };
  const slot = Math.floor((now.getUTCHours() * 60 + now.getUTCMinutes()) / 30);
  const attempt = await q.query("insert into wasl.job_runs (key) values ($1) on conflict (key) do nothing returning key", [`backup-try:${today}:${slot}`]);
  if (!attempt.rows.length) return { ran: false, reason: "waiting" as const };
  await q.query("delete from wasl.job_runs where key like 'backup-try:%' and key < $1", [`backup-try:${today}`]);
  const backup = await backupToDrive(q, today).catch((error) => { console.error("Wasl backup failed:", error instanceof Error ? error.message : "unknown"); return null; });
  if (!backup) return { ran: true, saved: false };
  await q.query("insert into wasl.job_runs (key) values ($1) on conflict (key) do nothing", [`backup:${today}`]);
  return { ran: true, saved: true, backup };
}

export async function cleanupFiles(q: Queryable = database()) {
  const orphans = (await q.query<{ id: string; storage: string; local_path: string | null; drive_file_id: string | null }>(
    "select id, storage::text as storage, local_path, drive_file_id from wasl.attachments where idea_id is null and kind <> 'logo' and created_at < now() - interval '24 hours' limit 200")).rows;
  let removed = 0;
  for (const file of orphans) {
    try {
      if (file.storage === "drive" && file.drive_file_id) await deleteFile(file.drive_file_id, q).catch(() => undefined);
      else if (file.local_path) await deleteBlob(file.storage, file.local_path);
      await q.query("update wasl.quotations set attachment_id = null where attachment_id = $1", [file.id]);
      await q.query("update wasl.upload_sessions set attachment_id = null where attachment_id = $1", [file.id]);
      await q.query("delete from wasl.attachments where id = $1 and idea_id is null", [file.id]);
      removed++;
    } catch { continue; }
  }
  const stale = (await q.query<{ id: string; storage: string; local_path: string }>(
    "select id, storage::text as storage, local_path from wasl.attachments where removed_at < now() - interval '30 days' and storage in ('local', 'supabase') and local_path is not null limit 200")).rows;
  for (const file of stale) {
    await deleteBlob(file.storage, file.local_path).catch(() => undefined);
    await q.query("update wasl.attachments set local_path = null, storage = 'external', external_url = '' where id = $1", [file.id]).catch(() => undefined);
  }
  await q.query("delete from wasl.upload_sessions where status <> 'done' and expires_at < now()");
  return { orphans: removed, expiredBlobs: stale.length };
}

function mailer() {
  if (process.env.WASL_EMAIL_ENABLED !== "true") return null;
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  transport ??= nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", requireTLS: process.env.SMTP_SECURE !== "true", auth: { user, pass } });
  return transport;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export async function sendPendingEmails(q: Queryable = database(), limit = 20) {
  const pending = (await q.query<{ id: string; title: string; body: string; email: string | null; name: string }>(
    "with claimed as (update wasl.notifications set email_claimed_at = now() where id in (select id from wasl.notifications where emailed_at is null and created_at > now() - interval '2 days' and (email_claimed_at is null or email_claimed_at < now() - interval '5 minutes') order by created_at limit $1 for update skip locked) returning id, title, body, recipient_id) select c.id, c.title, c.body, m.email, m.name from claimed c join wasl.members m on m.id = c.recipient_id", [limit])).rows;
  const smtp = mailer();
  let sent = 0;
  const origin = process.env.MEDIA_APP_ORIGIN || "";
  for (const notice of pending) {
    if (smtp && notice.email) {
      try {
        await smtp.sendMail({
          from: process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER, to: notice.email, subject: `وصل: ${notice.title}`,
          text: `${notice.name}،\n\n${notice.title}\n${notice.body}\n\n${origin}`,
          html: `<div dir="rtl" style="font-family:Tahoma,Arial"><p>${escapeHtml(notice.name)}،</p><p><b>${escapeHtml(notice.title)}</b></p><p>${escapeHtml(notice.body)}</p>${origin ? `<p><a href="${escapeHtml(origin)}">فتح نظام وصل</a></p>` : ""}</div>`,
        });
        sent++;
      } catch { await q.query("update wasl.notifications set email_claimed_at = null where id = $1", [notice.id]); continue; }
    }
    await q.query("update wasl.notifications set emailed_at = now() where id = $1", [notice.id]);
  }
  return { sent, pending: pending.length };
}

export async function runBackgroundWork(force = false) {
  if (!force && Date.now() - lastRun < 60_000) return null;
  lastRun = Date.now();
  const email = await sendPendingEmails().catch(() => null);
  const meetings = await runMeetingReminders().catch(() => 0);
  const taskReminders = await runTaskReminders().catch(() => 0);
  const honor = await database().transaction((tx) => announceHonor(tx)).then((winner) => winner?.memberId || null, () => null);
  const results = { email, meetings, taskReminders, honor, archive: await runDueArchiveJobs(3).catch(() => []), daily: await runDailyJobs().catch(() => null), backup: await runDailyBackup().catch(() => null), push: await flushPushOutbox().catch(() => null) };
  return results;
}

export async function backupToDrive(q: Queryable = database(), today = riyadhDate()) {
  const integration = await loadIntegration(q);
  if (!integration?.root_folder_id) return null;
  const root = integration.root_folder_id;
  const folder = await ensureFolder("backups", root, "نسخ احتياطية للنظام", root);
  const bytes = new Uint8Array(await createBackup(q));
  const file = await uploadWhole({ name: `wasl-backup-${today}${BACKUP_EXTENSION}`, parentId: folder, mime: "application/octet-stream", bytes, appProperties: { waslBackup: today } }, q);
  await q.query("insert into wasl.drive_folders (key, root_folder_id, folder_id, name) values ($1, $2, $3, $4) on conflict (key) do update set folder_id = excluded.folder_id", [`backup:${today}`, root, file.id, file.name]);
  const old = (await q.query<{ key: string; folder_id: string }>("select key, folder_id from wasl.drive_folders where key like 'backup:%' and key < $1 order by key", [`backup:${new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10)}`])).rows;
  for (const entry of old) { await deleteFile(entry.folder_id, q).catch(() => undefined); await q.query("delete from wasl.drive_folders where key = $1", [entry.key]); }
  return { fileId: file.id, size: bytes.length };
}
