import { requireUser } from "@/lib/server/auth";
import { apiError, MediaServerError, responseHeaders } from "@/lib/server/http";
import { loadIdeaFor } from "@/lib/server/state";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = (await context.params).id;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new MediaServerError("لم يتم العثور على الفكرة.", 404, "NOT_FOUND");
    const idea = await loadIdeaFor(await requireUser(request), id);
    if (!idea) throw new MediaServerError("لم يتم العثور على الفكرة.", 404, "NOT_FOUND");
    return Response.json({ idea }, { headers: responseHeaders });
  } catch (error) { return apiError(error); }
}
