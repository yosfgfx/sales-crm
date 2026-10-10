import { apiError, responseHeaders } from "@/lib/server/http";
import { runOperation } from "@/lib/server/ops";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { return Response.json(await runOperation(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
