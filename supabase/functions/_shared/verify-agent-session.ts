import {
  isActiveAgent,
  readSessionToken,
  sha256,
  SessionUnavailableError,
} from "./agent-security.ts";
import type { AuthClient } from "../agent-auth/handler.ts";

export async function verifyAgentSession(req: Request, client: Pick<AuthClient, "rpc">) {
  const token = readSessionToken(req.headers);
  if (!token) throw new Error("Session required");
  const tokenHash = await sha256(token);
  let result;
  try {
    result = await client.rpc("agent_session_resolve", { p_token_hash: tokenHash });
  } catch {
    throw new SessionUnavailableError("Session verification unavailable");
  }
  if (result.error) throw new SessionUnavailableError("Session verification unavailable");
  const { data } = result;
  if (!isActiveAgent(data)) throw new Error("Session required");
  return { agent: data, tokenHash };
}
