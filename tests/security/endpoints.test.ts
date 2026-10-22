import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
const { authorize, rpc, from } = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/agent-session.ts", () => ({
  authorizeAgentRequest: authorize,
}));
let admin: (req: Request) => Promise<Response>;
const agent = {
  id: "00000000-0000-4000-8000-000000000002",
  role: "state_admin",
  status: "Active",
  state_id: 24,
};
const request = () => new Request("https://example.invalid", { method: "POST" });
const access = (body: Record<string, unknown>) => ({
  headers: {},
  client: { rpc, from },
  session: { agent, tokenHash: "a".repeat(64) },
  body,
});
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: { get: () => undefined },
    serve: (fn: typeof admin) => {
      admin = fn;
    },
  });
  await import("../../supabase/functions/agent-admin/index");
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
});
describe("server agent operations", () => {
  it("stops before database calls when the shared gateway denies the caller", async () => {
    authorize.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await admin(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it.each([{ password_hash: "forged" }, { pass: "plaintext" }, { password: "short" }])(
    "rejects unsafe credential input %s",
    async (values) => {
      authorize.mockResolvedValue(access({ action: "create", values }));
      expect((await admin(request())).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("hashes a new password server-side and submits only verified identity", async () => {
    authorize.mockResolvedValue(
      access({
        action: "create",
        agentId: "forged",
        values: { name: "Synthetic", password: "synthetic-new-password" },
      }),
    );
    rpc.mockResolvedValue({ data: { id: "synthetic" }, error: null });
    expect((await admin(request())).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("agent_write_secure", {
      p_token_hash: "a".repeat(64),
      p_target_id: null,
      p_values: {
        name: "Synthetic",
        password_hash: expect.stringMatching(/^pbkdf2-sha256\$600000\$/),
      },
    });
  });
  it("keeps a successful registration when SMS is not configured", async () => {
    authorize.mockResolvedValue(
      access({
        action: "create",
        values: { name: "Synthetic", password: "synthetic-new-password" },
      }),
    );
    rpc.mockResolvedValue({
      data: { id: "synthetic", phone: "08031234567", name: "Synthetic" },
      error: null,
    });
    const response = await admin(
      new Request("https://edge.invalid", {
        method: "POST",
        headers: { origin: "https://ogunadc.com" },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.agent.id).toBe("synthetic");
    expect(body.sms).toMatchObject({ status: "unavailable", code: "SMS_UNAVAILABLE" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain("synthetic-new-password");
  });
});
