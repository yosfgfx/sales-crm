import { apiAccessAction, readApiAccess } from "@/lib/server/api-keys";
import { apiError, responseHeaders } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return Response.json(await readApiAccess(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return Response.json(await apiAccessAction(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
