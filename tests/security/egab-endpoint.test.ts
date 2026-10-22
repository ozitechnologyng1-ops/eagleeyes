import { beforeAll, beforeEach, describe, it, expect, vi } from "vite-plus/test";
const { authorize, submit, status, single, eq, from } = vi.hoisted(() => ({
  authorize: vi.fn(),
  submit: vi.fn(),
  status: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/agent-session.ts", () => ({
  authorizeAgentRequest: authorize,
}));
vi.mock("../../supabase/functions/_shared/agent-sms.ts", () => ({
  createSmsService: () => ({ submit, status }),
  smsStore: vi.fn(),
  loginMessage: vi.fn(),
}));
let handler: (req: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: { get: () => undefined },
    serve: (fn: typeof handler) => {
      handler = fn;
    },
  });
  await import("../../supabase/functions/agent-sms/index");
});
beforeEach(() => {
  vi.clearAllMocks();
  eq.mockReturnValue({ eq, single });
  from.mockReturnValue({ select: () => ({ eq }) });
});
function access(body: Record<string, unknown>, role = "state_admin") {
  authorize.mockResolvedValue({
    headers: {},
    client: { from },
    session: {
      agent: { id: "actor", role, status: "Active", state_id: 27 },
      tokenHash: "a".repeat(64),
    },
    body,
  });
}
const req = () => new Request("https://edge.invalid", { method: "POST" });
describe("SMS endpoint authorization", () => {
  it("does not allow field agents to run provider configuration probes", async () => {
    access({ action: "check" }, "pu_agent");
    expect((await handler(req())).status).toBe(403);
    expect(submit).not.toHaveBeenCalled();
  });
  it("returns the gateway rejection without sending", async () => {
    authorize.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await handler(req())).status).toBe(401);
    expect(submit).not.toHaveBeenCalled();
  });
  it("does not let field agents send arbitrary test messages", async () => {
    access({ action: "test", id: "test", to: "08031234567" }, "pu_agent");
    expect((await handler(req())).status).toBe(403);
    expect(submit).not.toHaveBeenCalled();
  });
  it("sends only the fixed test text for authorized administrators", async () => {
    access({ action: "test", id: "submission", to: "08031234567", message: "untrusted text" });
    submit.mockResolvedValue({ id: "submission", status: "pending" });
    expect((await handler(req())).status).toBe(200);
    expect(submit).toHaveBeenCalledWith(
      "submission",
      "actor",
      null,
      "08031234567",
      "EagleEye SMS configuration test.",
    );
  });
  it("limits status lookups to the verified submission owner", async () => {
    access({ action: "status", id: "another-submission" });
    single.mockResolvedValue({ data: null, error: { code: "not_found" } });
    expect((await handler(req())).status).toBe(404);
    expect(eq).toHaveBeenCalledWith("actor_id", "actor");
    expect(status).not.toHaveBeenCalled();
  });
  it("rejects credential retries outside the existing admin hierarchy", async () => {
    access({ action: "retryCredentials", id: "submission", password: "synthetic" });
    single
      .mockResolvedValueOnce({ data: { agent_id: "target" }, error: null })
      .mockResolvedValueOnce({
        data: { id: "target", role: "national_admin", status: "Active", state_id: null },
        error: null,
      });
    expect((await handler(req())).status).toBe(403);
    expect(submit).not.toHaveBeenCalled();
  });
});
