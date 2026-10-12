import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { audit, bearerToken } from "@/lib/server/api-access";
import { appOrigin } from "@/lib/server/api-keys";
import { apiCaller, internalRequests, sessionUser } from "@/lib/server/auth";
import { database } from "@/lib/server/db";
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
  const payload = request.method === "POST" ? await request.clone().json().catch(() => null) : null;
  const methods = (Array.isArray(payload) ? payload : [payload]).map((message) => (message && typeof message === "object" ? String((message as { method?: unknown }).method || "") : "")).filter((method) => method && method !== "tools/call" && !method.startsWith("notifications/"));
  const caller = apiCaller(member);
  for (const method of methods) await audit(database(), { keyId: caller?.keyId, memberId: member.id, channel: "mcp", action: method });
  const server = createWaslServer({ member, token, origin });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return withCors(await transport.handleRequest(request));
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
