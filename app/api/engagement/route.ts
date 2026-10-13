import { after } from "next/server";
import { apiError, responseHeaders } from "@/lib/server/http";
import { engagementAction, loadEngagement, loadProfile } from "@/lib/server/engagement";
import { flushPushOutbox } from "@/lib/server/push";

export const runtime = "nodejs";
export const maxDuration = 26;

export async function GET(request: Request) {
  try {
    const profile = new URL(request.url).searchParams.get("profile");
    return Response.json(profile ? await loadProfile(request, profile) : await loadEngagement(request), { headers: responseHeaders });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const result = await engagementAction(request);
    after(() => flushPushOutbox().then(() => undefined, () => undefined));
    return Response.json(result, { headers: responseHeaders });
  } catch (error) {
    return apiError(error);
  }
}
