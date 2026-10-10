import { currentSession, login, logout } from "@/lib/server/auth";
import { apiError, responseHeaders } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return Response.json(await currentSession(request), { headers: responseHeaders }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return await login(request); } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try { return await logout(request); } catch (error) { return apiError(error); }
}
