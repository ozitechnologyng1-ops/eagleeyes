import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import handler from "../../api/analyze-result";

function response() {
  return {
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
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("legacy result scan URL", () => {
  it("rejects missing agent sessions before forwarding", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const res = response();
    await handler({ method: "POST", headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("forwards the same image and agent session to Supabase without an OpenAI key", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "synthetic-anon-jwt");
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ results: { number_of_valid_votes: 78 }, ai_used: "gpt-4.1" }),
    });
    vi.stubGlobal("fetch", fetcher);
    const token = "a".repeat(64);
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { "x-agent-session": token },
        body: {
          imageBase64: "ZmFrZQ==",
          mimeType: "image/jpeg",
        },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://example.supabase.co/functions/v1/analyze-result",
    );
    expect(fetcher.mock.calls[0][1].headers["x-agent-session"]).toBe(token);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      imageBase64: "ZmFrZQ==",
      mimeType: "image/jpeg",
    });
    expect(JSON.stringify(fetcher.mock.calls[0][1])).not.toContain("OPENAI");
  });
});
