export const agentRoles = [
  "pu_agent",
  "ward_admin",
  "lga_admin",
  "state_admin",
  "national_admin",
] as const;

export type AgentRole = (typeof agentRoles)[number];

export interface AgentIdentity {
  id: string;
  role: AgentRole;
  status: string;
  state_id: number | null;
  local_governments_id: number | null;
  wards_id: number | null;
  polling_units_id: number | null;
}

export const sessionTokenPattern = /^[a-f0-9]{64}$/;
export class SessionUnavailableError extends Error {}
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) =>
  Uint8Array.from(value.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16));

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export function createSessionToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations },
        key,
        256,
      ),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || password.length > 1024) throw new Error("Invalid password length");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$600000$${hex(salt)}$${await derivePassword(password, salt, 600000)}`;
}

export async function verifyPassword(password: unknown, stored: unknown): Promise<boolean> {
  if (typeof password !== "string" || !password || password.length > 1024) return false;
  if (typeof stored !== "string") return false;
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    return constantTimeEqual(await sha256(password), stored.toLowerCase());
  }
  const match = /^pbkdf2-sha256\$(600000)\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored);
  if (!match) return false;
  return constantTimeEqual(
    await derivePassword(password, unhex(match[2]), Number(match[1])),
    match[3],
  );
}

export function isActiveAgent(value: unknown): value is AgentIdentity {
  if (!value || typeof value !== "object") return false;
  const agent = value as AgentIdentity;
  return (
    typeof agent.id === "string" &&
    agent.status?.toLowerCase() === "active" &&
    agentRoles.includes(agent.role)
  );
}

export function withinAgentScope(
  caller: AgentIdentity,
  target: Pick<
    AgentIdentity,
    "state_id" | "local_governments_id" | "wards_id" | "polling_units_id"
  >,
): boolean {
  if (!isActiveAgent(caller)) return false;
  if (caller.role === "national_admin") return true;
  if (!caller.state_id || caller.state_id !== target.state_id) return false;
  if (caller.role === "state_admin") return true;
  if (!caller.local_governments_id || caller.local_governments_id !== target.local_governments_id)
    return false;
  if (caller.role === "lga_admin") return true;
  if (!caller.wards_id || caller.wards_id !== target.wards_id) return false;
  if (caller.role === "ward_admin") return true;
  return !!caller.polling_units_id && caller.polling_units_id === target.polling_units_id;
}

export function canManageAgent(caller: AgentIdentity, target: AgentIdentity): boolean {
  return (
    agentRoles.includes(target.role) &&
    agentRoles.indexOf(caller.role) > agentRoles.indexOf(target.role) &&
    withinAgentScope(caller, target)
  );
}

export function mayAdministerState(caller: AgentIdentity, stateId: number): boolean {
  return (
    isActiveAgent(caller) &&
    (caller.role === "national_admin" ||
      (caller.role === "state_admin" && caller.state_id === stateId))
  );
}

export function readSessionToken(headers: Headers): string | null {
  const token = headers.get("x-agent-session");
  return token && sessionTokenPattern.test(token) ? token : null;
}

export async function readJsonObject(
  req: Request,
  maxBytes = 16384,
): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new Error("Expected JSON");
  if (!req.body) throw new Error("Missing request body");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected object");
  return data;
}
