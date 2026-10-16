import { corsHeaders, requireAgent, serviceClient } from "../_shared/agent-session.ts";
import { createAgentAuthHandler, type AuthClient } from "./handler.ts";

function authClient(): AuthClient {
  const client = serviceClient();
  return {
    rpc: (name, args) => client.rpc(name, args),
    credential: (phone) =>
      client.from("agents").select("id,role,status,password_hash").eq("phone", phone).maybeSingle(),
  };
}
Deno.serve(createAgentAuthHandler({ corsHeaders, requireAgent, serviceClient: authClient }));
