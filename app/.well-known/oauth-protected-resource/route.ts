import { appOrigin } from "@/lib/server/api-keys";
import { corsHeaders, oauthJson, protectedResourceMetadata } from "@/lib/server/oauth";

export const runtime = "nodejs";

export function GET(request: Request) {
  return oauthJson(protectedResourceMetadata(appOrigin(request)));
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
