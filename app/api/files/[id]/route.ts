import { downloadFile } from "@/lib/server/files";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await downloadFile(request, (await context.params).id); } catch (error) { return apiError(error); }
}
