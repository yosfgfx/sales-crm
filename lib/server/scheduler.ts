import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import type { MediaNotification } from "@/data/media";
import { runDueArchiveJobs } from "./archive";
import { database, type Queryable } from "./db";
import { insertNotifications } from "./repository";

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
    "select id, title, status::text as status, owner_id, designer_id, due_date::text as due_date from wasl.ideas where status::text = any($1::text[]) and due_date <= $2::date", [ACTIVE, addDays(today, 2)])).rows;
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
  return { ran: true, reminders: notices.length };
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
    "select n.id, n.title, n.body, m.email, m.name from wasl.notifications n join wasl.members m on m.id = n.recipient_id where n.emailed_at is null and n.created_at > now() - interval '2 days' order by n.created_at limit $1", [limit])).rows;
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
      } catch { continue; }
    }
    await q.query("update wasl.notifications set emailed_at = now() where id = $1", [notice.id]);
  }
  return { sent, pending: pending.length };
}

export async function runBackgroundWork(force = false) {
  if (!force && Date.now() - lastRun < 60_000) return null;
  lastRun = Date.now();
  const results = { archive: await runDueArchiveJobs(3).catch(() => []), daily: await runDailyJobs().catch(() => null), email: await sendPendingEmails().catch(() => null) };
  return results;
}
