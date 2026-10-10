import { apiError, responseHeaders, uploadFiles } from "@/lib/media-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { return Response.json({ files: await uploadFiles(request) }, { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
