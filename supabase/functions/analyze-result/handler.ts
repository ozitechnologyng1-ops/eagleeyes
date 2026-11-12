const VISION_PROMPT = `Extract the visible data from this Nigerian INEC Statement of Result of Poll from Polling Unit form. Return one JSON object with these fields: state, local_government_area, local_government (always null), registration_area, polling_unit, number_of_voters_on_register, number_of_accredited_voters, number_of_ballot_papers_issued, number_of_unused_ballot_papers, number_of_spoiled_ballot_papers, number_of_rejected_ballots, number_of_valid_votes, total_number_of_used_ballots, total_votes_cast, political_party_results, presiding_officer_name, form_serial_number, poll_code. All number fields must be nonnegative integers. political_party_results must be an array of objects with party, votes_in_figures, votes_in_words, and polling_agent_signature_or_name. Extract final corrected handwritten values, preserve political party acronyms, and use proper title case for the LGA. Do not guess a geographic database ID. Use zero only when a number is visibly zero; for an unreadable number, return null so the user can retry or retake the image.`;

const MAX_IMAGE_BYTES = 3_000_000;
const requiredCounts = [
  "number_of_voters_on_register",
  "number_of_accredited_voters",
  "number_of_ballot_papers_issued",
  "number_of_unused_ballot_papers",
  "number_of_spoiled_ballot_papers",
  "number_of_rejected_ballots",
  "number_of_valid_votes",
  "total_number_of_used_ballots",
] as const;

export function validImage(data: unknown, mimeType: unknown): data is string {
  if (
    typeof data !== "string" ||
    !["image/jpeg", "image/png", "image/webp"].includes(String(mimeType)) ||
    data.length < 100 ||
    data.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    return false;
  try {
    const binary = atob(data);
    if (binary.length > MAX_IMAGE_BYTES || btoa(binary) !== data) return false;
    const byte = (index: number) => binary.charCodeAt(index);
    if (mimeType === "image/jpeg") return byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff;
    if (mimeType === "image/png") return binary.slice(0, 8) === "\x89PNG\r\n\x1a\n";
    return binary.slice(0, 4) === "RIFF" && binary.slice(8, 12) === "WEBP";
  } catch {
    return false;
  }
}

export function validateResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The scan did not return a valid result");
  const result = value as Record<string, unknown>;
  for (const field of requiredCounts) {
    if (!Number.isSafeInteger(result[field]) || (result[field] as number) < 0)
      throw new Error("The scan missed one or more result figures");
  }
  if (
    !Array.isArray(result.political_party_results) ||
    result.political_party_results.length > 100 ||
    result.political_party_results.some(
      (party: unknown) =>
        !party ||
        typeof party !== "object" ||
        typeof (party as { party?: unknown }).party !== "string" ||
        !/^[\p{L}\p{N} .&'-]{1,60}$/u.test((party as { party: string }).party) ||
        !Number.isSafeInteger((party as { votes_in_figures?: unknown }).votes_in_figures) ||
        (party as { votes_in_figures: number }).votes_in_figures < 0,
    )
  )
    throw new Error("The scan did not return valid party figures");
  return { ...result, local_government: null };
}

type AuthorizedRequest = { headers: Record<string, string>; body: Record<string, unknown> };
type Authorize = (
  req: Request,
  action: string,
  maxBytes: number,
) => Promise<Response | AuthorizedRequest>;

export function createAnalyzeResultHandler(
  authorize: Authorize,
  getOpenAiSecret: () => string | undefined,
  fetcher: typeof fetch = fetch,
  getGroqSecret: () => string | undefined = () => undefined,
  getGeminiSecret: () => string | undefined = () => undefined,
) {
  return async (req: Request): Promise<Response> => {
    const access = await authorize(req, "analyze-result", 4_200_000);
    if (access instanceof Response) return access;
    const headers = { ...access.headers, "Content-Type": "application/json" };
    const reply = (status: number, error: string, reason?: string) =>
      new Response(JSON.stringify({ error, ...(reason ? { reason } : {}) }), { status, headers });
    const { imageBase64, mimeType } = access.body;
    if (!validImage(imageBase64, mimeType))
      return reply(400, "Upload a JPEG, PNG, or WebP image under 3 MB");
    const openAiKey = getOpenAiSecret()?.trim();
    const groqKey = getGroqSecret()?.trim();
    const geminiKey = getGeminiSecret()?.trim();
    if (!openAiKey && !groqKey && !geminiKey)
      return reply(503, "Result scanning is not configured");

    const resultReply = (value: unknown, aiUsed: string) =>
      new Response(JSON.stringify({ results: validateResult(value), ai_used: aiUsed }), {
        status: 200,
        headers,
      });
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    if (openAiKey) {
      try {
        const upstream = await fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4.1",
            store: false,
            max_output_tokens: 4000,
            text: { format: { type: "json_object" } },
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: VISION_PROMPT },
                  { type: "input_image", image_url: imageUrl, detail: "high" },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!upstream.ok) {
          const failure = await upstream.json().catch(() => null);
          const code =
            typeof failure?.error?.code === "string" && /^[a-z0-9_]{1,60}$/.test(failure.error.code)
              ? failure.error.code
              : null;
          console.error("OpenAI result scan failed", {
            status: upstream.status,
            code,
            requestId: upstream.headers.get("x-request-id"),
          });
        } else {
          const payload = await upstream.json();
          const output = (
            payload.output as
              | Array<{ content?: Array<{ type?: string; text?: string }> }>
              | undefined
          )
            ?.flatMap((item) => item.content || [])
            .find((part) => part.type === "output_text")?.text;
          if (typeof output === "string") return resultReply(JSON.parse(output), "gpt-4.1");
          console.error("OpenAI result scan returned no text", { status: payload.status });
        }
      } catch (error) {
        console.error(
          "OpenAI result scan unavailable",
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    }

    if (groqKey) {
      try {
        const upstream = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: VISION_PROMPT },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(12_000),
        });
        if (!upstream.ok) console.error("Groq result scan failed", { status: upstream.status });
        else {
          const payload = await upstream.json();
          const output = payload.choices?.[0]?.message?.content;
          if (typeof output === "string") return resultReply(JSON.parse(output), "llama-4-scout");
        }
      } catch (error) {
        console.error(
          "Groq result scan unavailable",
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    }

    if (geminiKey) {
      for (const [model, label] of [
        ["gemini-3.1-flash-lite-preview", "gemini-3.1-flash-lite"],
        ["gemini-2.5-flash", "gemini-2.5-flash"],
      ]) {
        try {
          const upstream = await fetcher(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      { text: VISION_PROMPT },
                      { inline_data: { mime_type: mimeType, data: imageBase64 } },
                    ],
                  },
                ],
                generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
              }),
              signal: AbortSignal.timeout(8_000),
            },
          );
          if (!upstream.ok)
            console.error("Gemini result scan failed", { model, status: upstream.status });
          else {
            const payload = await upstream.json();
            const output = payload.candidates?.[0]?.content?.parts?.[0]?.text;
            if (typeof output === "string") return resultReply(JSON.parse(output), label);
          }
        } catch (error) {
          console.error("Gemini result scan unavailable", {
            model,
            name: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }
    }
    return reply(
      502,
      "Image analysis failed across available providers. Retry with the same photo.",
      "all_providers_failed",
    );
  };
}
