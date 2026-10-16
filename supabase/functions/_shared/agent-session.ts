import { agentCorsHeaders } from "./agent-cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createAgentAuthorizer } from "./agent-gateway.ts";
import { verifyAgentSession } from "./verify-agent-session.ts";
import type { AuthClient } from "../agent-auth/handler.ts";

export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Server configuration unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function corsHeaders(req: Request): Record<string, string> {
  return agentCorsHeaders(req, Deno.env.get("AGENT_ALLOWED_ORIGINS"));
}

export async function requireAgent(
  req: Request,
  client: Pick<AuthClient, "rpc"> = serviceClient(),
) {
  return verifyAgentSession(req, client);
}

export const authorizeAgentRequest = createAgentAuthorizer<ReturnType<typeof serviceClient>>({
  corsHeaders,
  serviceClient,
  requireAgent,
});
