import { apiError, responseHeaders } from "@/lib/server/http";
import { deleteSocialVoice, downloadSocialVoice } from "@/lib/server/social";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return await downloadSocialVoice(request, (await context.params).id);
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    return Response.json(
      await deleteSocialVoice(request, (await context.params).id),
      { headers: responseHeaders },
    );
  } catch (error) {
    return apiError(error);
  }
}
