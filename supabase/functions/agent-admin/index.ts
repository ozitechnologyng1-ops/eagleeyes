import { authorizeAgentRequest } from "../_shared/agent-session.ts";
import { hashPassword } from "../_shared/agent-security.ts";

Deno.serve(async (req: Request) => {
  const access = await authorizeAgentRequest(req, "agent-admin", 4194304);
  if (access instanceof Response) return access;
  const { headers, client, session, body } = access;
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  try {
    if (body.action !== "create" && body.action !== "update")
      return reply({ error: "Invalid action" }, 400);
    if (
      body.action === "update" &&
      (typeof body.id !== "string" ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.id))
    )
      return reply({ error: "Invalid agent" }, 400);
    if (!body.values || typeof body.values !== "object" || Array.isArray(body.values))
      return reply({ error: "Invalid fields" }, 400);
    const values = { ...body.values } as Record<string, unknown>;
    if ("password_hash" in values || "pass" in values)
      return reply({ error: "Invalid fields" }, 400);
    if ("password" in values) {
      if (
        typeof values.password !== "string" ||
        values.password.length < 8 ||
        values.password.length > 1024
      )
        return reply({ error: "Password must be 8–1024 characters" }, 400);
      values.password_hash = await hashPassword(values.password);
      delete values.password;
    }
    const { data, error } = await client.rpc("agent_write_secure", {
      p_token_hash: session.tokenHash,
      p_target_id: body.action === "create" ? null : body.id,
      p_values: values,
    });
    if (error)
      return reply(
        { error: "Agent change rejected; check permissions and field values" },
        error.code === "28000" ? 401 : error.code === "42501" ? 403 : 400,
      );
    return reply({ agent: data });
  } catch {
    return reply({ error: "Request temporarily unavailable" }, 503);
  }
});
