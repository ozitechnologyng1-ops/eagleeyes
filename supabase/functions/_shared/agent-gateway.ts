import { readJsonObject, SessionUnavailableError, type AgentIdentity } from "./agent-security.ts";
import type { AuthClient } from "../agent-auth/handler.ts";

export function createAgentAuthorizer<Client extends Pick<AuthClient, "rpc">>(deps: {
  corsHeaders(req: Request): Record<string, string>;
  serviceClient(): Client;
  requireAgent(req: Request, client: Client): Promise<{ agent: AgentIdentity; tokenHash: string }>;
}) {
  return async (req: Request, action: string, maxBytes = 16384) => {
    let headers: Record<string, string>;
    try {
      headers = deps.corsHeaders(req);
    } catch {
      return new Response(null, { status: 403 });
    }
    const reply = (error: string, status: number) =>
      new Response(JSON.stringify({ error }), {
        status,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return reply("Method not allowed", 405);
    let client: Client;
    try {
      client = deps.serviceClient();
    } catch {
      return reply("Service temporarily unavailable", 503);
    }
    let session;
    try {
      session = await deps.requireAgent(req, client);
    } catch (error) {
      return reply(
        "Session verification required",
        error instanceof SessionUnavailableError ? 503 : 401,
      );
    }
    try {
      const { data: allowed, error } = await client.rpc("agent_action_attempt", {
        p_token_hash: session.tokenHash,
        p_action: action,
      });
      if (error) return reply("Service temporarily unavailable", 503);
      if (allowed !== true) return reply("Too many requests; try again later", 429);
    } catch {
      return reply("Service temporarily unavailable", 503);
    }
    try {
      return { headers, client, session, body: await readJsonObject(req, maxBytes) };
    } catch {
      return reply("Invalid request", 400);
    }
  };
}
