import { authorizeAgentRequest } from "../_shared/agent-session.ts";
import { createSmsService, loginMessage, smsStore } from "../_shared/agent-sms.ts";
import { canManageAgent, verifyPassword } from "../_shared/agent-security.ts";
import { EgabConfigError, EgabError, egabConfig, createEgabClient } from "../_shared/egab.ts";

Deno.serve(async (req: Request) => {
  // Reuse the existing ten-per-minute admin rate limit without changing auth/RLS.
  const access = await authorizeAgentRequest(req, "agent-admin");
  if (access instanceof Response) return access;
  const { headers, client, session, body } = access;
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  try {
    if (body.action === "check") {
      if (!["national_admin", "state_admin"].includes(session.agent.role))
        return reply({ error: "Administrator access required" }, 403);
      const config = egabConfig((key) => Deno.env.get(key));
      const request = createEgabClient(config);
      let balance;
      try {
        balance = await request("GET", "/api/v1/bulksms/balance");
      } catch (error) {
        if (error instanceof EgabError && error.status === 406) {
          // One unsigned read distinguishes transport filtering from signed-request filtering.
          const probe = await fetch(config.base + "/api/v1/bulksms/balance", {
            headers: {
              Accept: "application/json",
              // "User-Agent": "EagleEye/1.0",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          });
          return reply(
            {
              error: error.message,
              code: error.code,
              base: config.base,
              provider_http_status: error.status,
              unsigned_http_status: probe.status,
              request_id: error.requestId,
            },
            503,
          );
        }
        throw error;
      }
      const registry = await request("GET", "/api/v1/bulksms/sender-ids");
      const senders = registry.data as unknown;
      return reply({
        configured: true,
        authenticated: true,
        base: config.base,
        mode: /^(?:egab_)?pk_(test|live)_/.exec(config.key)?.[1] || "unspecified",
        transactionalDefault:
          Array.isArray(senders) &&
          senders.some(
            (sender) =>
              sender.is_default === true &&
              sender.status === "approved" &&
              sender.type === "transactional",
          ),
        request_id: balance.requestId,
        registry_request_id: registry.requestId,
      });
    }
    const sms = createSmsService(smsStore(client), (key) => Deno.env.get(key));
    if (body.action === "test" && typeof body.to === "string" && typeof body.id === "string") {
      if (!["national_admin", "state_admin"].includes(session.agent.role))
        return reply({ error: "Administrator access required" }, 403);
      return reply({
        sms: await sms.submit(
          body.id,
          session.agent.id,
          null,
          body.to,
          "EagleEye SMS configuration test.",
        ),
      });
    }
    if (
      (body.action === "status" || body.action === "retryCredentials") &&
      typeof body.id === "string"
    ) {
      const { data, error } = await client
        .from("agent_sms_submissions")
        .select()
        .eq("id", body.id)
        .eq("actor_id", session.agent.id)
        .single();
      if (error || !data) return reply({ error: "SMS submission not found" }, 404);
      if (body.action === "retryCredentials") {
        const target = await client
          .from("agents")
          .select(
            "id,role,status,state_id,local_governments_id,wards_id,polling_units_id,phone,name,first_name,password_hash",
          )
          .eq("id", data.agent_id)
          .single();
        if (
          target.error ||
          !target.data ||
          !canManageAgent(session.agent, target.data) ||
          !(await verifyPassword(body.password, target.data.password_hash))
        )
          return reply({ error: "Credential SMS retry rejected" }, 403);
        const message = loginMessage(
          String(target.data.first_name || target.data.name || "Agent").split(" ")[0],
          target.data.phone,
          body.password as string,
          req,
          Deno.env.get("AGENT_ALLOWED_ORIGINS"),
        );
        return reply({
          sms: await sms.submit(
            data.id,
            session.agent.id,
            target.data.id,
            target.data.phone,
            message,
            true,
          ),
        });
      }
      return reply({ sms: await sms.status(data) });
    }
    return reply({ error: "Invalid SMS request" }, 400);
  } catch (error) {
    if (error instanceof EgabConfigError)
      return reply({ error: error.message, code: error.code }, 503);
    if (error instanceof EgabError)
      return reply(
        {
          error: error.message,
          code: error.code,
          provider_http_status: error.status,
          request_id: error.requestId,
        },
        503,
      );
    return reply(
      { error: "SMS unavailable; check server configuration and retain the submission key" },
      503,
    );
  }
});
