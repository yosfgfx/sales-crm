import { timingSafeEqual } from "node:crypto";
import { apiError, MediaServerError, responseHeaders } from "@/lib/server/http";
import { runBackgroundWork } from "@/lib/server/scheduler";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (secret.length < 32 || provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) throw new MediaServerError("غير مصرح.", 401, "CRON_UNAUTHORIZED");
}

async function run(request: Request) {
  try { authorize(request); return Response.json(await runBackgroundWork(true), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export const GET = run;
export const POST = run;
