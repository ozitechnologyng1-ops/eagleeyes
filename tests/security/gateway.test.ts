import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createAgentAuthorizer } from "../../supabase/functions/_shared/agent-gateway";
import { agentCorsHeaders } from "../../supabase/functions/_shared/agent-cors";
import {
  SessionUnavailableError,
  type AgentIdentity,
} from "../../supabase/functions/_shared/agent-security";

const agent: AgentIdentity = {
  id: "fixture",
  role: "state_admin",
  status: "Active",
  state_id: 27,
  local_governments_id: null,
  wards_id: null,
  polling_units_id: null,
};
const rpc = vi.fn();
const requireAgent = vi.fn();
const serviceClient = vi.fn(() => ({ rpc }));
const authorize = createAgentAuthorizer({
  corsHeaders: agentCorsHeaders,
  requireAgent,
  serviceClient,
});
const request = (body = "{}", origin = "https://ogunadc.com", method = "POST") =>
  new Request("https://example.invalid", {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(method === "POST" ? { body } : {}),
  });
beforeEach(() => {
  vi.clearAllMocks();
  serviceClient.mockReturnValue({ rpc });
  requireAgent.mockResolvedValue({ agent, tokenHash: "a".repeat(64) });
  rpc.mockResolvedValue({ data: true, error: null });
});
describe("authenticated endpoint gateway", () => {
  it("accepts production preflight without consulting credentials or the database", async () => {
    const result = await authorize(request("{}", undefined, "OPTIONS"), "agent-sms");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(204);
    expect((result as Response).headers.get("access-control-allow-origin")).toBe(
      "https://ogunadc.com",
    );
    expect(requireAgent).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["https://ogunadc.com.evil.invalid", "https://untrusted.invalid", "null"])(
    "rejects unapproved origin %s before any privileged work",
    async (origin) => {
      expect(((await authorize(request("{}", origin), "agent-sms")) as Response).status).toBe(403);
      expect(serviceClient).not.toHaveBeenCalled();
    },
  );
  it("does not authorize missing sessions or rate-limit denied requests", async () => {
    requireAgent.mockRejectedValueOnce(new Error("Missing"));
    expect(((await authorize(request(), "agent-sms")) as Response).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(((await authorize(request(), "agent-sms")) as Response).status).toBe(429);
  });
  it("distinguishes temporary verification failure from invalid identity", async () => {
    requireAgent.mockRejectedValueOnce(new SessionUnavailableError());
    expect(((await authorize(request(), "agent-sms")) as Response).status).toBe(503);
    rpc.mockRejectedValueOnce(new Error("Network"));
    expect(((await authorize(request(), "agent-sms")) as Response).status).toBe(503);
  });
  it("rejects oversized payloads and returns only the verified identity", async () => {
    expect(
      (
        (await authorize(
          request(JSON.stringify({ message: "a".repeat(20000) })),
          "agent-sms",
        )) as Response
      ).status,
    ).toBe(400);
    const access = await authorize(request('{"agentId":"forged"}'), "agent-sms");
    expect(access).not.toBeInstanceOf(Response);
    if (!(access instanceof Response)) expect(access.session.agent.id).toBe("fixture");
  });
});
