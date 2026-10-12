import { appOrigin } from "@/lib/server/api-keys";
import { authorizationServerMetadata, corsHeaders, oauthJson } from "@/lib/server/oauth";

export const runtime = "nodejs";

export function GET(request: Request) {
  return oauthJson(authorizationServerMetadata(appOrigin(request)));
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
