import { apiError, responseHeaders } from "@/lib/server/http";
import { deleteDemoData, demoDataSummary } from "@/lib/server/idea-import";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return Response.json(await demoDataSummary(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try { return Response.json(await deleteDemoData(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}
