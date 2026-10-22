import { authorizeAgentRequest } from "../_shared/agent-session.ts";
import { hashPassword } from "../_shared/agent-security.ts";
import { createSmsService, loginMessage, smsStore } from "../_shared/agent-sms.ts";

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
    const registrationPassword = typeof values.password === "string" ? values.password : null;
    if ("password_hash" in values || "pass" in values)
      return reply({ error: "Invalid fields" }, 400);
    if ("password" in values) {
      if (
        typeof values.password !== "string" ||
        values.password.length < 6 ||
        values.password.length > 1024
      )
        return reply({ error: "Password must be at least 6 characters" }, 400);
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
    let sms;
    if (registrationPassword && data?.id && (body.action === "create" || body.notifySms === true)) {
      const id = crypto.randomUUID();
      try {
        const message = loginMessage(
          String(data.first_name || data.name || "Agent").split(" ")[0],
          String(data.phone),
          registrationPassword,
          req,
          Deno.env.get("AGENT_ALLOWED_ORIGINS"),
        );
        sms = await createSmsService(smsStore(client), (key) => Deno.env.get(key)).submit(
          id,
          session.agent.id,
          data.id,
          String(data.phone),
          message,
          true,
        );
      } catch {
        sms = { id, status: "unavailable", code: "SMS_UNAVAILABLE" };
      }
    }
    return reply({ agent: data, sms });
  } catch {
    return reply({ error: "Request temporarily unavailable" }, 503);
  }
});
