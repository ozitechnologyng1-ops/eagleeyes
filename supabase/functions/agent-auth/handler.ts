import {
  createSessionToken,
  isActiveAgent,
  readJsonObject,
  sha256,
  verifyPassword,
  SessionUnavailableError,
} from "../_shared/agent-security.ts";

interface Result<T> {
  data: T | null;
  error: unknown;
}
interface CredentialRow {
  id: string;
  role: string;
  status: string;
  password_hash: string;
}
export interface AuthClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result<unknown>>;
  credential(phone: string): PromiseLike<Result<CredentialRow>>;
}
interface AuthDependencies {
  corsHeaders(req: Request): Record<string, string>;
  serviceClient(): AuthClient;
  requireAgent(req: Request, client: AuthClient): Promise<{ agent: unknown; tokenHash: string }>;
}

export function createAgentAuthHandler({
  corsHeaders,
  requireAgent,
  serviceClient,
}: AuthDependencies) {
  return async (req: Request) => {
    let headers: Record<string, string>;
    try {
      headers = corsHeaders(req);
    } catch {
      return new Response(null, { status: 403 });
    }
    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    let body: Record<string, unknown>;
    try {
      body = await readJsonObject(req);
    } catch {
      return reply({ error: "Invalid request" }, 400);
    }
    try {
      const client = serviceClient();
      if (body.action === "login") {
        const phone = typeof body.phone === "string" ? body.phone.trim() : "";
        if (
          !/^\+?[0-9]{7,16}$/.test(phone) ||
          typeof body.password !== "string" ||
          !body.password ||
          body.password.length > 1024
        )
          return reply({ error: "Invalid phone or password" }, 401);
        const { data: allowed, error: limitError } = await client.rpc("agent_login_attempt", {
          p_phone_hash: await sha256(phone),
        });
        if (limitError) return reply({ error: "Login temporarily unavailable" }, 503);
        if (allowed !== true) return reply({ error: "Too many attempts; try again later" }, 429);
        const { data: agent, error } = await client.credential(phone);
        // Unknown accounts still take a SHA-256 comparison path.
        const valid = await verifyPassword(body.password, agent?.password_hash || "0".repeat(64));
        if (error || !isActiveAgent(agent) || !valid)
          return reply({ error: "Invalid phone or password" }, 401);
        const token = createSessionToken();
        const tokenHash = await sha256(token);
        const { data: expiresAt, error: issueError } = await client.rpc("agent_session_issue", {
          p_agent_id: agent.id,
          p_token_hash: tokenHash,
          p_credential_version: await sha256(agent.password_hash),
        });
        if (issueError) return reply({ error: "Login temporarily unavailable" }, 503);
        const { data: profile, error: profileError } = await client.rpc("agent_session_resolve", {
          p_token_hash: tokenHash,
        });
        if (profileError || !isActiveAgent(profile))
          return reply({ error: "Login temporarily unavailable" }, 503);
        return reply({ token, expiresAt, agent: profile });
      }
      if (body.action !== "me" && body.action !== "logout")
        return reply({ error: "Unknown action" }, 400);
      let session;
      try {
        session = await requireAgent(req, client);
      } catch (error) {
        if (error instanceof SessionUnavailableError)
          return reply({ error: "Session verification temporarily unavailable" }, 503);
        return reply({ error: "Session expired; please sign in" }, 401);
      }
      if (body.action === "logout") {
        const { error } = await client.rpc("agent_session_revoke", {
          p_token_hash: session.tokenHash,
        });
        if (error) return reply({ error: "Sign-out temporarily unavailable" }, 503);
        return reply({ success: true });
      }
      return reply({ agent: session.agent });
    } catch {
      return reply({ error: "Request temporarily unavailable" }, 503);
    }
  };
}
