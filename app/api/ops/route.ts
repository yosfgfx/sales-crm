import { after } from "next/server";
import { runDueArchiveJobs } from "@/lib/server/archive";
import { apiError, responseHeaders } from "@/lib/server/http";
import { runOperation } from "@/lib/server/ops";
import { flushPushOutbox } from "@/lib/server/push";

export const runtime = "nodejs";
export const maxDuration = 26;

export async function POST(request: Request) {
  try {
    const result = await runOperation(request);
    if (result.idea?.status === "delivered" && result.idea.archive?.status === "pending") after(() => runDueArchiveJobs(3).then(() => undefined, () => undefined));
    after(() => flushPushOutbox().then(() => undefined, () => undefined));
    return Response.json(result, { headers: responseHeaders });
  } catch (error) { return apiError(error); }
}
