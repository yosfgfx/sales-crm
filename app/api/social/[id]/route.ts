import { apiError, responseHeaders } from "@/lib/server/http";
import { getSocialMessage, mutateSocialMessage } from "@/lib/server/social";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return Response.json(
      await getSocialMessage(request, (await context.params).id),
      { headers: responseHeaders },
    );
  } catch (error) {
    return apiError(error);
  }
}
async function mutate(request: Request, context: Context) {
  try {
    return Response.json(
      await mutateSocialMessage(request, (await context.params).id),
      { headers: responseHeaders },
    );
  } catch (error) {
    return apiError(error);
  }
}
export const PATCH = mutate;
export const DELETE = mutate;
