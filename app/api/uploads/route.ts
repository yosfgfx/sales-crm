import { apiError, responseHeaders } from "@/lib/server/http";
import { startUpload } from "@/lib/server/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { return Response.json(await startUpload(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
