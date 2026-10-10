import { mfaAction } from "@/lib/server/auth";
import { apiError, responseHeaders } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { return Response.json(await mfaAction(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
