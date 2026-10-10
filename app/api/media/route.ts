import { requireUser } from "@/lib/server/auth";
import { apiError, responseHeaders } from "@/lib/server/http";
import { loadStateFor } from "@/lib/server/state";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return Response.json(await loadStateFor(await requireUser(request)), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
