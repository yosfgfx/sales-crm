import { apiError, mutateAccounts, readAccounts, responseHeaders } from "@/lib/media-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return Response.json(await readAccounts(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return await mutateAccounts(request); } catch (error) { return apiError(error); }
}
