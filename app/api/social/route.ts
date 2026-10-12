import { apiError, responseHeaders } from "@/lib/server/http";
import { createSocialMessage, listSocialMessages } from "@/lib/server/social";

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
    return Response.json(await createSocialMessage(request), {
      headers: responseHeaders,
    });
  } catch (error) {
    return apiError(error);
  }
}
