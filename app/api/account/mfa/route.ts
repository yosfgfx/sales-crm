import { mfaResponse } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { return await mfaResponse(request); } catch (error) { return apiError(error); }
}
