import { apiError, readMediaState, requireUser, responseHeaders, saveMediaState } from "@/lib/media-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { const state = await readMediaState(); await requireUser(request, state); return Response.json(state, { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return Response.json(await saveMediaState(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
