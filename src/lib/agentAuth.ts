import { supabase } from "./supabase";
import { clearAgentSession, readAgentSession, saveAgentSession } from "./agentSession";

export const AGENT_PUBLIC_COLUMNS =
  "id,created_at,name,phone,role,status,jurisdiction_type,jurisdiction_id,profile_picture_url,bank_name,account_number,first_name,last_name,account_name,state_id,local_governments_id,wards_id,polling_units_id,whatsapp_earnings_balance,daily_outreach_target,supporting_documents";

async function callAgentEndpoint(
  name: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const requestToken = headers?.["x-agent-session"] || readAgentSession()?.token;
  const { data, error } = await supabase.functions.invoke(name, { body, headers });
  if (error) {
    let message = "Unable to complete the request. Please try again.";
    if (error.context instanceof Response) {
      const response = await error.context.json().catch(() => null);
      if (typeof response?.error === "string") message = response.error;
      if (
        error.context.status === 401 &&
        body.action !== "login" &&
        readAgentSession()?.token === requestToken
      )
        clearAgentSession();
    }
    throw new Error(message);
  }
  if (!data || data.error) throw new Error(data?.error || "Invalid server response");
  return data;
}

export async function loginAgent(phone: string, password: string) {
  clearAgentSession();
  const data = await callAgentEndpoint("agent-auth", { action: "login", phone, password });
  if (!data.agent?.id || "password_hash" in data.agent || "pass" in data.agent)
    throw new Error("Invalid login response");
  saveAgentSession(data.token, data.expiresAt);
  return data.agent;
}

export async function restoreAgent() {
  if (!readAgentSession()) return null;
  const data = await callAgentEndpoint("agent-auth", { action: "me" });
  if (!data.agent?.id) throw new Error("Invalid session response");
  return data.agent;
}

export async function logoutAgent() {
  const session = readAgentSession();
  clearAgentSession();
  if (session)
    await callAgentEndpoint(
      "agent-auth",
      { action: "logout" },
      { "x-agent-session": session.token },
    );
}

export async function writeAgent(
  id: string | null,
  values: Record<string, unknown>,
  notifySms = false,
) {
  const data = await callAgentEndpoint("agent-admin", {
    action: id ? "update" : "create",
    id,
    values,
    notifySms,
  });
  if (!data.agent?.id) throw new Error("Invalid agent response");
  return { ...data.agent, smsSubmission: data.sms };
}

export async function deleteAgentApi(id: string) {
  const data = await callAgentEndpoint("agent-admin", {
    action: "delete",
    id,
  });
  return data;
}
