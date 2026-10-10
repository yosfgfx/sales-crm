import { uploadFiles } from "@/lib/server/files";
import { apiError, responseHeaders } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { return Response.json({ files: await uploadFiles(request) }, { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
