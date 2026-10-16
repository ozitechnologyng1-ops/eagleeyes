import { authorizeAgentRequest } from "../_shared/agent-session.ts";
import { canManageAgent, mayAdministerState } from "../_shared/agent-security.ts";
import {
  normalizePhone,
  publicSmsConfig,
  validateSmsConfig,
  type SmsConfig,
} from "../_shared/sms-security.ts";

Deno.serve(async (req: Request) => {
  const access = await authorizeAgentRequest(req, "agent-sms");
  if (access instanceof Response) return access;
  const { headers, client, session, body } = access;
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  try {
    const stateId = body.stateId;
    if (typeof stateId !== "number" || !Number.isSafeInteger(stateId) || stateId <= 0)
      return reply({ error: "Invalid state" }, 400);
    if (!["getConfig", "saveConfig", "send", "test"].includes(String(body.action)))
      return reply({ error: "Invalid action" }, 400);
    const admin = mayAdministerState(session.agent, stateId);
    if (!admin && (session.agent.state_id !== stateId || session.agent.role === "pu_agent"))
      return reply({ error: "Not authorized" }, 403);
    if ((body.action === "saveConfig" || body.action === "test") && !admin)
      return reply({ error: "Not authorized" }, 403);
    const values = body.action === "saveConfig" ? validateSmsConfig(body.config) : null;
    const { data, error } = admin
      ? await client.rpc("agent_sms_config", {
          p_token_hash: session.tokenHash,
          p_state_id: stateId,
          p_values: values,
        })
      : await client.rpc("agent_sms_delivery_config", {
          p_token_hash: session.tokenHash,
          p_state_id: stateId,
        });
    if (error) return reply({ error: "SMS configuration unavailable" }, 503);
    const saved: SmsConfig = {
      account_sid: Deno.env.get("TWILIO_ACCOUNT_SID") || "",
      auth_token: Deno.env.get("TWILIO_AUTH_TOKEN") || "",
      api_key_sid: Deno.env.get("TWILIO_API_KEY_SID") || "",
      api_secret: Deno.env.get("TWILIO_API_SECRET") || "",
      from_number: Deno.env.get("TWILIO_FROM_NUMBER") || "EagleEye",
      ...(data || {}),
    };
    if (body.action === "getConfig" || body.action === "saveConfig")
      return reply({ config: publicSmsConfig(saved) });
    const to = normalizePhone(body.to);
    if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 1600)
      return reply({ error: "Message must be 1–1600 characters" }, 400);
    if (body.action === "send") {
      const variants = [to, to.slice(1), to.startsWith("+234") ? "0" + to.slice(4) : to];
      const { data: targets, error: targetError } = await client
        .from("agents")
        .select("id,phone,role,status,state_id,local_governments_id,wards_id,polling_units_id")
        .in("phone", variants)
        .limit(2);
      const target = targets?.length === 1 ? targets[0] : null;
      if (targetError) return reply({ error: "Recipient lookup unavailable" }, 503);
      if (
        !target ||
        target.state_id !== stateId ||
        (target.id !== session.agent.id && !canManageAgent(session.agent, target))
      )
        return reply({ error: "Recipient outside your permission scope" }, 403);
    }
    const config = validateSmsConfig({
      ...saved,
      ...(body.action === "test" && body.config ? validateSmsConfig(body.config) : {}),
    });
    if (!publicSmsConfig(config).configured)
      return reply({ error: "SMS credentials have not been configured on the server" }, 409);
    const authUser =
      config.api_key_sid && config.api_secret ? config.api_key_sid : config.account_sid!;
    const authPass =
      config.api_key_sid && config.api_secret ? config.api_secret : config.auth_token!;
    const params = new URLSearchParams({ To: to, Body: body.message });
    params.set(
      config.from_number?.startsWith("MG") ? "MessagingServiceSid" : "From",
      config.from_number || "EagleEye",
    );
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${authUser}:${authPass}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
    const result = await response.json();
    if (!response.ok)
      return reply(
        { error: "SMS provider rejected the request; check the server configuration" },
        502,
      );
    return reply({ success: true, messageId: result.sid });
  } catch {
    return reply({ error: "Unable to process this SMS request" }, 400);
  }
});
