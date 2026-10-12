import { apiError, responseHeaders } from "@/lib/server/http";
import { uploadSocialVoice } from "@/lib/server/social";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return Response.json(await uploadSocialVoice(request), {
      headers: responseHeaders,
    });
  } catch (error) {
    return apiError(error);
  }
}
