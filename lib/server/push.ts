import webpush from "web-push";
import { database, type Queryable } from "./db";

let configured: boolean | null = null;

function ready() {
  if (configured !== null) return configured;
  const publicKey = process.env.WASL_VAPID_PUBLIC_KEY, privateKey = process.env.WASL_VAPID_PRIVATE_KEY;
  const subject = process.env.WASL_VAPID_SUBJECT || process.env.MEDIA_APP_ORIGIN || "https://wusl.netlify.app";
  configured = !!publicKey && !!privateKey;
  if (configured) webpush.setVapidDetails(subject, publicKey!, privateKey!);
  return configured;
}

export async function flushPushOutbox(q: Queryable = database(), limit = 40) {
  if (!ready()) return { sent: 0, skipped: true };
  const claimed = (await q.query<{ id: string; member_id: string; title: string; body: string; url: string; notification_id: string }>(
    `update wasl.push_outbox set attempts = attempts + 1 where id in (
      select id from wasl.push_outbox where sent_at is null and attempts < 3 and created_at > now() - interval '1 day' order by id limit $1 for update skip locked
    ) returning id, member_id, title, body, url, notification_id`, [limit])).rows;
  let sent = 0;
  for (const message of claimed) {
    const subscriptions = (await q.query<{ id: string; endpoint: string; p256dh: string; auth: string }>("select id, endpoint, p256dh, auth from wasl.push_subscriptions where member_id = $1", [message.member_id])).rows;
    const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.notification_id });
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 3600, urgency: "normal", timeout: 8000 });
        await q.query("update wasl.push_subscriptions set last_success_at = now(), failures = 0 where id = $1", [subscription.id]);
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await q.query("delete from wasl.push_subscriptions where id = $1", [subscription.id]);
        else await q.query("update wasl.push_subscriptions set failures = failures + 1 where id = $1", [subscription.id]);
      }
    }
    await q.query("update wasl.push_outbox set sent_at = now() where id = $1", [message.id]);
  }
  await q.query("delete from wasl.push_outbox where created_at < now() - interval '7 days'");
  await q.query("delete from wasl.push_subscriptions where failures >= 20");
  return { sent, claimed: claimed.length };
}
