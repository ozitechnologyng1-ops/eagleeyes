import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { update, select } = vi.hoisted(() => ({ update: vi.fn(), select: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ update, select }) }),
}));

import { POST, verifyEgabDelivery } from "../../api/egab-delivery";
import statusHandler from "../../api/egab-sms";

const reference = "01a1cf35-5103-731d-bd20-14fd030fc762";
const submissionId = "14b519a4-78da-4700-ae7d-889afe282490";
const secret = "synthetic-webhook-secret";

function signedRequest(event = "bulksms.message.delivered", status = "delivered") {
  const body = JSON.stringify({ event, data: { reference, status } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return new Request("https://example.test/api/egab-delivery", {
    method: "POST",
    headers: { "x-egab-signature": `t=${timestamp},v1=${signature}`, "x-egab-event": event },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("EGAB_WEBHOOK_SECRET", secret);
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_synthetic");
  update.mockReturnValue({
    eq: () => ({ in: async () => ({ error: null }) }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("EGAB delivery tracking", () => {
  it("rejects forged or stale webhook signatures without touching the database", async () => {
    const forged = signedRequest();
    forged.headers.set(
      "x-egab-signature",
      `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`,
    );
    expect((await POST(forged)).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
    expect(verifyEgabDelivery("t=1000000000,v1=" + "0".repeat(64), "{}", secret)).toBe(false);
  });

  it("updates only the matching nonterminal log for a signed delivered event", async () => {
    expect((await POST(signedRequest())).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "delivered" }));
    expect((await POST(signedRequest("bulksms.message.failed", "failed"))).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("looks up a submission ID, asks EGAB for its reference, and persists the result", async () => {
    select.mockReturnValue({
      or: () => ({
        limit: () => ({
          maybeSingle: async () => ({ data: { id: submissionId, reference }, error: null }),
        }),
      }),
    });
    update.mockReturnValue({
      eq: () => ({ select: async () => ({ data: [{ id: submissionId }], error: null }) }),
    });
    vi.stubEnv("EGAB_KEY", "egab_pk_synthetic");
    vi.stubEnv("EGAB_SECRET", "egab_sk_synthetic");
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { reference, status: "delivered" } }),
    });
    vi.stubGlobal("fetch", fetcher);
    const response = {
      statusCode: 200,
      body: null as unknown,
      setHeader: vi.fn(),
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    await statusHandler({ method: "GET", query: { reference: submissionId } }, response);
    expect(response.statusCode).toBe(200);
    expect(fetcher.mock.calls[0][0]).toContain(reference);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "delivered" }));
  });
});
