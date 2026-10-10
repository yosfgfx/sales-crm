import { apiError, responseHeaders } from "@/lib/server/http";
import { importIdeas } from "@/lib/server/idea-import";

export const runtime = "nodejs";
export const maxDuration = 26;

export async function POST(request: Request) {
  try { return Response.json(await importIdeas(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
