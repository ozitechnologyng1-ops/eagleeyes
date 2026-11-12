import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import handler, { validateResult } from "../../api/analyze-result";

const token = "a".repeat(64);
const imageBase64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]).toString(
  "base64",
);
const result = {
  number_of_voters_on_register: 100,
  number_of_accredited_voters: 80,
  number_of_ballot_papers_issued: 80,
  number_of_unused_ballot_papers: 20,
  number_of_spoiled_ballot_papers: 1,
  number_of_rejected_ballots: 1,
  number_of_valid_votes: 78,
  total_number_of_used_ballots: 80,
  political_party_results: [{ party: "ADC", votes_in_figures: 78 }],
};

function response() {
  const res = {
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
  return res;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    method: "POST",
    headers: { "x-agent-session": token },
    body: { imageBase64, mimeType: "image/jpeg" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_synthetic");
  vi.stubEnv("OPEN_AI", "sk-synthetic");
  rpc.mockImplementation(async (name: string) =>
    name === "agent_session_resolve"
      ? { data: { id: "agent", status: "Active" }, error: null }
      : { data: true, error: null },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("result image analysis", () => {
  it("rejects unauthenticated and invalid image requests before calling OpenAI", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const unauthorized = response();
    await handler(request({ headers: {} }), unauthorized);
    expect(unauthorized.statusCode).toBe(401);
    const invalid = response();
    await handler(request({ body: { imageBase64, mimeType: "image/png" } }), invalid);
    expect(invalid.statusCode).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("enforces the existing agent scan limit", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "agent_session_resolve"
        ? { data: { id: "agent", status: "Active" }, error: null }
        : { data: false, error: null },
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(429);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the photo to OpenAI without storing a response and validates the figures", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ai_used: "gpt-4.1",
      results: { number_of_valid_votes: 78, local_government: null },
    });
    const outbound = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(outbound.store).toBe(false);
    expect(outbound.input[0].content[1].type).toBe("input_image");
    expect(() => validateResult({ ...result, number_of_valid_votes: null })).toThrow();
  });
});
