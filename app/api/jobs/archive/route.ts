import { timingSafeEqual } from "node:crypto";
import { runDueArchiveJobs } from "@/lib/server/archive";
import { apiError, MediaServerError, responseHeaders } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (secret.length < 32 || provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) throw new MediaServerError("غير مصرح.", 401, "CRON_UNAUTHORIZED");
}

async function run(request: Request) {
  try { authorize(request); return Response.json({ results: await runDueArchiveJobs(5) }, { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export const GET = run;
export const POST = run;
