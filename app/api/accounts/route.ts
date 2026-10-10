import { mutateAccounts, readAccounts } from "@/lib/server/auth";
import { apiError, responseHeaders } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return Response.json(await readAccounts(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return await mutateAccounts(request); } catch (error) { return apiError(error); }
}
