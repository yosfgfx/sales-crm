import { requireUser } from "@/lib/server/auth";
import { apiError, assertSameOrigin, responseHeaders } from "@/lib/server/http";

export const runtime = "nodejs";

const NOT_CONNECTED = "لم يُربط Google Drive بعد. يربطه مالك النظام من الإعدادات.";

export async function GET(request: Request) {
  try { await requireUser(request); return Response.json({ configured: false, files: [], message: NOT_CONNECTED }, { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { assertSameOrigin(request); await requireUser(request); return Response.json({ configured: false, error: NOT_CONNECTED, code: "DRIVE_NOT_CONFIGURED", files: [], alreadyArchivedCount: 0 }, { status: 503, headers: responseHeaders }); } catch (error) { return apiError(error); }
}
