import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerToken } from "@/lib/server/api-access";
import { appOrigin } from "@/lib/server/api-keys";
import { internalRequests, sessionUser } from "@/lib/server/auth";
import { MediaServerError } from "@/lib/server/http";
import { createWaslServer } from "@/lib/server/mcp/server";
import { corsHeaders } from "@/lib/server/oauth";

export const runtime = "nodejs";
export const maxDuration = 26;

function withCors(response: Response, extra: Record<string, string> = {}) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries({ ...corsHeaders, ...extra })) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handle(request: Request) {
  const origin = appOrigin(request);
  const challenge = { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"` };
  const token = bearerToken(request);
  if (!token) return withCors(Response.json({ error: "unauthorized", error_description: "Sign in with OAuth or send a Wasl API key." }, { status: 401 }), challenge);
  internalRequests.add(request);
  let member;
  try { member = await sessionUser(request); }
  catch (error) {
    if (error instanceof MediaServerError) return withCors(Response.json({ error: error.code, error_description: error.message }, { status: error.status }), error.status === 401 ? challenge : {});
    throw error;
  }
  if (!member) return withCors(Response.json({ error: "invalid_token", error_description: "The token is invalid, expired or revoked." }, { status: 401 }), { ...challenge, "WWW-Authenticate": `${challenge["WWW-Authenticate"]}, error="invalid_token"` });
  const server = createWaslServer({ member, token, origin });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try { return withCors(await transport.handleRequest(request)); }
  finally { void server.close(); }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
