import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { VISION_AI_PROMPT } from "../src/lib/prompts";

export const config = { maxDuration: 60 };

const MAX_IMAGE_BYTES = 3_000_000;
const sessionPattern = /^[a-f0-9]{64}$/;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
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

function validImage(data: unknown, mimeType: unknown): data is string {
  if (typeof data !== "string" || typeof mimeType !== "string" || !imageTypes.has(mimeType))
    return false;
  if (
    data.length < 100 ||
    data.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    return false;
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== data) return false;
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png")
    return bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = req.headers?.["x-agent-session"];
  if (typeof token !== "string" || !sessionPattern.test(token))
    return res.status(401).json({ error: "Sign in to scan a result" });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPEN_AI || process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !supabaseKey || !openaiKey)
    return res.status(503).json({ error: "Result scanning is not configured" });
  const { imageBase64, mimeType } = req.body || {};
  if (!validImage(imageBase64, mimeType))
    return res.status(400).json({ error: "Upload a JPEG, PNG, or WebP image under 3 MB" });

  try {
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await client.rpc("agent_session_resolve", { p_token_hash: tokenHash });
    if (session.error) return res.status(503).json({ error: "Session verification unavailable" });
    if (!session.data?.id || String(session.data.status).toLowerCase() !== "active")
      return res.status(401).json({ error: "Sign in to scan a result" });
    const attempt = await client.rpc("agent_action_attempt", {
      p_token_hash: tokenHash,
      p_action: "analyze-result",
    });
    if (attempt.error) return res.status(503).json({ error: "Scan limit unavailable" });
    if (attempt.data !== true)
      return res.status(429).json({ error: "Too many scans. Try again shortly" });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        store: false,
        max_output_tokens: 4000,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: VISION_AI_PROMPT },
              {
                type: "input_image",
                image_url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok) {
      console.error("OpenAI result scan failed", {
        status: response.status,
        requestId: response.headers.get("x-request-id"),
      });
      return res.status(502).json({ error: "Image analysis failed. Retry with the same photo" });
    }
    const payload = await response.json();
    const output = payload.output
      ?.flatMap((item: any) => item.content || [])
      .find((part: any) => part.type === "output_text")?.text;
    if (typeof output !== "string") throw new Error("Missing model output");
    const results = validateResult(JSON.parse(output));
    return res.status(200).json({ results, ai_used: "gpt-4.1" });
  } catch (error) {
    console.error("Result scan unavailable", error instanceof Error ? error.name : "UnknownError");
    return res.status(502).json({ error: "Image analysis failed. Retry with the same photo" });
  }
}
