import { apiError, responseHeaders } from "@/lib/server/http";
import { integrationAction, integrationStatus } from "@/lib/server/integration";

export const runtime = "nodejs";
export const maxDuration = 26;

export async function GET(request: Request) {
  try { return Response.json(await integrationStatus(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return Response.json(await integrationAction(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
