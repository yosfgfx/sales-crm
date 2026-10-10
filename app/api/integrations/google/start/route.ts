import { apiError } from "@/lib/server/http";
import { startConnect } from "@/lib/server/integration";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return await startConnect(request); } catch (error) { return apiError(error); }
}
