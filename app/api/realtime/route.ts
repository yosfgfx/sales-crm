import { apiError, responseHeaders } from "@/lib/server/http";
import { realtimeConfig } from "@/lib/server/realtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return Response.json(await realtimeConfig(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
