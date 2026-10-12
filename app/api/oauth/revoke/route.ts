import { corsHeaders, revokeEndpoint } from "@/lib/server/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { return await revokeEndpoint(request); } catch { return Response.json({}, { headers: corsHeaders }); }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
