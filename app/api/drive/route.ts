import { apiError, archiveDriveFiles, listDriveFiles, responseHeaders } from "@/lib/media-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return Response.json(await listDriveFiles(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return await archiveDriveFiles(request); } catch (error) { return apiError(error); }
}
