export default async function runScheduledJobs() {
  const origin = process.env.MEDIA_APP_ORIGIN || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!origin || !secret) return new Response("Scheduled jobs are not configured.", { status: 500 });
  const response = await fetch(`${origin}/api/jobs/archive`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(25_000) });
  return new Response(await response.text(), { status: response.status });
}

export const config = { schedule: "*/15 * * * *" };
