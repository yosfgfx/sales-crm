import { apiError, responseHeaders } from "@/lib/server/http";
import { putChunk, uploadStatus } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await putChunk(request, (await context.params).id), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await uploadStatus(request, (await context.params).id), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
