import { apiError, responseHeaders } from "@/lib/server/http";
import { approveAuthorization, describeClient } from "@/lib/server/oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return Response.json(await describeClient(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return Response.json(await approveAuthorization(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
