import { after } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { apiError, responseHeaders } from "@/lib/server/http";
import { runBackgroundWork } from "@/lib/server/scheduler";
import { loadStateFor } from "@/lib/server/state";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const state = await loadStateFor(await requireUser(request));
    after(() => runBackgroundWork().then(() => undefined, () => undefined));
    return Response.json(state, { headers: responseHeaders });
  } catch (error) { return apiError(error); }
}
