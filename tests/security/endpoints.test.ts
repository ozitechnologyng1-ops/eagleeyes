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
let sms: (req: Request) => Promise<Response>;
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
  vi.stubGlobal("Deno", {
    env: { get: () => undefined },
    serve: (fn: typeof sms) => {
      sms = fn;
    },
  });
  await import("../../supabase/functions/agent-sms/index");
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
    expect((await sms(request())).status).toBe(401);
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
  it("redacts provider secrets when loading SMS settings", async () => {
    authorize.mockResolvedValue(access({ action: "getConfig", stateId: 24 }));
    rpc.mockResolvedValue({
      data: { account_sid: "AC" + "a".repeat(32), auth_token: "synthetic-server-secret" },
      error: null,
    });
    const response = await sms(request());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.config.auth_token).toBe("");
    expect(data.config.configured).toBe(true);
  });
  it("rejects cross-state SMS settings before retrieving secrets", async () => {
    authorize.mockResolvedValue(access({ action: "getConfig", stateId: 27 }));
    expect((await sms(request())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects unknown SMS configuration keys", async () => {
    authorize.mockResolvedValue(
      access({ action: "saveConfig", stateId: 24, config: { endpoint: "https://evil.invalid" } }),
    );
    expect((await sms(request())).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
