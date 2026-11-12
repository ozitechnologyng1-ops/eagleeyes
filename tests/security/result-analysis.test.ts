import { describe, expect, it, vi } from "vite-plus/test";
import {
  createAnalyzeResultHandler,
  validImage,
  validateResult,
} from "../../supabase/functions/analyze-result/handler";

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

const request = () =>
  new Request("https://example.supabase.co/functions/v1/analyze-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }),
  });
const authorized = vi.fn(async () => ({
  headers: { "Access-Control-Allow-Origin": "https://ogunadc.com" },
  body: { imageBase64, mimeType: "image/jpeg" },
}));

describe("Supabase result analysis", () => {
  it("rejects unauthorized and invalid image requests before provider calls", async () => {
    const fetcher = vi.fn();
    const denied = createAnalyzeResultHandler(
      async () => new Response(null, { status: 401 }),
      () => "test-key",
      fetcher as typeof fetch,
    );
    expect((await denied(request())).status).toBe(401);
    const invalid = createAnalyzeResultHandler(
      async () => ({
        headers: {},
        body: {
          imageBase64: "invalid",
          mimeType: "image/jpeg",
        },
      }),
      () => "test-key",
      fetcher as typeof fetch,
    );
    expect((await invalid(request())).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect(validImage(imageBase64, "image/jpeg")).toBe(true);
    expect(() => validateResult({ ...result, number_of_valid_votes: null })).toThrow();
  });

  it("uses OpenAI first without storing the response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
        }),
        { status: 200 },
      ),
    );
    const handler = createAnalyzeResultHandler(
      authorized,
      () => "test-openai",
      fetcher as typeof fetch,
      () => "test-groq",
      () => "test-gemini",
    );
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ai_used: "gpt-4.1",
      results: {
        number_of_valid_votes: 78,
        local_government: null,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    expect(body.input[0].content[1].type).toBe("input_image");
  });

  it("falls back to Groq when OpenAI returns 401", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "invalid_api_key" } }), {
          status: 401,
          headers: { "x-request-id": "synthetic-request-id" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(result) } }],
          }),
          { status: 200 },
        ),
      );
    const handler = createAnalyzeResultHandler(
      authorized,
      () => "test-openai",
      fetcher as typeof fetch,
      () => "test-groq",
    );
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect((await response.json()).ai_used).toBe("llama-4-scout");
    expect(fetcher.mock.calls[1][0]).toContain("api.groq.com");
  });

  it("falls back to Gemini and reports failure only after all providers fail", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
          }),
          { status: 200 },
        ),
      );
    const handler = createAnalyzeResultHandler(
      authorized,
      () => "test-openai",
      fetcher as typeof fetch,
      () => "test-groq",
      () => "test-gemini",
    );
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect((await response.json()).ai_used).toBe("gemini-3.1-flash-lite");
    expect(fetcher.mock.calls[2][0]).toContain("gemini-3.1-flash-lite-preview");

    const failing = createAnalyzeResultHandler(
      authorized,
      () => "test-openai",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })) as typeof fetch,
    );
    const failed = await failing(request());
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ reason: "all_providers_failed" });
  });
});
