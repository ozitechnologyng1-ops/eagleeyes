import { describe, expect, it, vi } from "vite-plus/test";
import {
  normalizeCe8aCode,
  validateCe8aAssignment,
} from "../../supabase/functions/analyze-result/form-identity";
import {
  createAnalyzeResultHandler,
  validImage,
  validateResult,
} from "../../supabase/functions/analyze-result/handler";

const imageBase64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]).toString(
  "base64",
);

it("matches the printed CE8A code and election without requiring an exact polling-unit name", () => {
  const assignment = { code: "24-01-07-017", state: "Lagos", lga: "AGEGE", ward: "KEKE" };
  const form = {
    election_title: "2023 GOVERNORSHIP ELECTION",
    state: "Lagos State",
    local_government_area: "Agege",
    registration_area: "Keke",
    polling_unit_code: "024-1-7-017",
    polling_unit: "A name with different spelling",
  };
  expect(normalizeCe8aCode(form.polling_unit_code)).toBe(assignment.code);
  expect(validateCe8aAssignment(form, "governorship", assignment)).toBeNull();
  expect(
    validateCe8aAssignment(
      { ...form, polling_unit_code: "24-01-07-018" },
      "governorship",
      assignment,
    ),
  ).toMatch(/doesn’t match your polling unit/);
  expect(
    validateCe8aAssignment(
      { ...form, registration_area: "Other ward" },
      "governorship",
      assignment,
    ),
  ).toMatch(/doesn’t match your polling unit/);
  expect(validateCe8aAssignment(form, "presidential", assignment)).toMatch(
    /doesn’t match your selection/,
  );
  expect(
    validateCe8aAssignment({ ...form, polling_unit_code: null }, "governorship", assignment),
  ).toMatch(/couldn’t read the polling-unit code/);
});
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
  it("preserves clear printed counts and refuses to turn unreadable votes into zeros", () => {
    expect(
      validateResult({
        ...result,
        number_of_voters_on_register: "1,200",
        number_of_spoiled_ballot_papers: "NIL",
        political_party_results: [{ party: " ADC ", votes_in_figures: "78" }],
      }),
    ).toMatchObject({
      number_of_voters_on_register: 1200,
      number_of_spoiled_ballot_papers: 0,
      total_votes_cast: 80,
      political_party_results: [{ party: "ADC", votes_in_figures: 78 }],
    });
    expect(() =>
      validateResult({
        ...result,
        political_party_results: [{ party: "ADC", votes_in_figures: null }],
      }),
    ).toThrow(/party vote entries/);
  });

  it("reports unreadable counts separately from an OpenAI outage", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      Response.json({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ ...result, number_of_valid_votes: null }),
              },
            ],
          },
        ],
      }),
    );
    const handler = createAnalyzeResultHandler(authorized, () => "openai", fetcher as typeof fetch);
    const response = await handler(request());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      reason: "unreadable_result",
      error: expect.stringContaining("valid votes"),
    });
  });

  it("does not retry an AI provider when the polling-unit assignment check fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
      }),
    );
    const handler = createAnalyzeResultHandler(
      authorized,
      () => "openai",
      fetcher as typeof fetch,
      async () => {
        throw new Error("synthetic lookup failure");
      },
    );
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: "assignment_unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

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

  it("uses only OpenAI without storing the response", async () => {
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

  it.each([
    [401, 502],
    [429, 503],
    [500, 502],
  ])("reports OpenAI HTTP %s without calling another provider", async (upstreamStatus, status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: upstreamStatus }));
    const handler = createAnalyzeResultHandler(
      authorized,
      () => "test-openai",
      fetcher as typeof fetch,
    );
    const response = await handler(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ reason: "openai_unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  });
});
