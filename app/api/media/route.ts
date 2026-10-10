import { after } from "next/server";
import { runDueArchiveJobs } from "@/lib/server/archive";
import { requireUser } from "@/lib/server/auth";
import { apiError, responseHeaders } from "@/lib/server/http";
import { loadStateFor } from "@/lib/server/state";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const state = await loadStateFor(await requireUser(request));
    if (state.data.ideas.some((idea) => idea.archive && ["pending", "failed"].includes(idea.archive.status))) after(() => runDueArchiveJobs(2).then(() => undefined, () => undefined));
    return Response.json(state, { headers: responseHeaders });
  } catch (error) { return apiError(error); }
}
