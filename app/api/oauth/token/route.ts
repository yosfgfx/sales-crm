import { corsHeaders, tokenEndpoint } from "@/lib/server/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { return await tokenEndpoint(request); } catch { return Response.json({ error: "server_error" }, { status: 500, headers: corsHeaders }); }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
