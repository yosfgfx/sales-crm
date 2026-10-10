import { finishConnect } from "@/lib/server/integration";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return finishConnect(request);
}
