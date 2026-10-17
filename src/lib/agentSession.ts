export const SESSION_KEY = "eagleeye_agent_session";
export const SESSION_CHANGED_EVENT = "eagleeye-session-changed";

interface AgentSession {
  token: string;
  expiresAt: string | null;
}

export function readAgentSession(): AgentSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (
      data &&
      typeof data.token === "string" &&
      /^[a-f0-9]{64}$/.test(data.token) &&
      (data.expiresAt === null ||
        (typeof data.expiresAt === "string" && Date.parse(data.expiresAt) > Date.now()))
    )
      return data;
  } catch {
    // Invalid cached state cannot establish identity.
  }
  return null;
}

export function saveAgentSession(token: string, expiresAt: string | null) {
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token) ||
    (expiresAt !== null &&
      (typeof expiresAt !== "string" ||
        !Number.isFinite(Date.parse(expiresAt)) ||
        Date.parse(expiresAt) <= Date.now()))
  )
    throw new Error("Invalid login response");
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt }));
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem("temp_login_phone");
}

export function clearAgentSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem("temp_login_phone");
  localStorage.removeItem("eagleeye_user");
  localStorage.removeItem("eagleeye_login_time");
  localStorage.removeItem("eagleeye_last_active");
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function agentRequestHeaders(original?: HeadersInit, includeSession = true): Headers {
  const headers = new Headers(original);
  headers.delete("x-agent-id");
  headers.delete("x-agent-phone");
  if (!includeSession) {
    headers.delete("x-agent-session");
    return headers;
  }
  const session = readAgentSession();
  if (session && !headers.has("x-agent-session")) headers.set("x-agent-session", session.token);
  return headers;
}
