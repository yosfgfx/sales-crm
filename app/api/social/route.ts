import { apiError, responseHeaders } from "@/lib/server/http";
import { after } from "next/server";
import { createSocialMessage, listSocialMessages } from "@/lib/server/social";
import { flushPushOutbox } from "@/lib/server/push";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return Response.json(await listSocialMessages(request), {
      headers: responseHeaders,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const result = await createSocialMessage(request);
    after(() => flushPushOutbox().then(() => undefined, () => undefined));
    return Response.json(result, {
      headers: responseHeaders,
    });
  } catch (error) {
    return apiError(error);
  }
}
