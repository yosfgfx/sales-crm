import { apiError } from "@/lib/server/http";
import { openEventStream } from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return await openEventStream(request);
  } catch (error) {
    return apiError(error);
  }
}
