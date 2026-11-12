import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const VISION_AI_PROMPT = `
You are a data extraction AI. Your task is to convert the information in this Nigerian INEC "Statement of Result of Poll from Polling Unit" form into a clean and structured JSON format, following SOP.

Use these JSON keys:

{
  "state": "",
  "local_government_area": "",
  "local_government": null,  // Set this to null, the backend will assign it based on the agent's jurisdiction
  "registration_area": "",
  "polling_unit": "",
  "number_of_voters_on_register": 0, // Item 1
  "number_of_accredited_voters": 0,    // Item 2
  "number_of_ballot_papers_issued": 0, // Item 3
  "number_of_unused_ballot_papers": 0, // Item 4
  "number_of_spoiled_ballot_papers": 0,// Item 5
  "number_of_rejected_ballots": 0,     // Item 6
  "number_of_valid_votes": 0,          // Item 7
  "total_number_of_used_ballots": 0,   // Item 8
  "total_votes_cast": 0,               // Alternative key for item 8
  "political_party_results": [
    {
      "party": "",
      "votes_in_figures": 0,
      "votes_in_words": "",
      "polling_agent_signature_or_name": ""
    }
  ],
  "presiding_officer_name": "",
  "form_serial_number": "",
  "poll_code": {
    "code1": "",
    "code2": "",
    "code3": ""
  }
}

Instructions for political_party_results:
- Extract all political party results as an **array of objects**.
- Each object should have these keys: "party", "votes_in_figures", "votes_in_words", and "polling_agent_signature_or_name".
- Do NOT output this field as a JSON string or any serialized string.
- The output should be a proper JSON array of objects, suitable for direct insertion into a database table with a structured column or a related table

Instructions:
1. Extract all visible data exactly as shown. Forms will often be extremely messy. When dealing with overwritten, heavily crossed-out, or corrected values (e.g. Tipp-Ex), carefully extract the final, intended value written by the officer.
2. Handle informal or missing headers: You may see abbreviations like "LG", "LGA" (Local Government Area), "PU" (Polling Unit), or "RA" (Registration Area / Ward). Sometimes the form will lack printed headers entirely, and contain just the name (e.g. "dorcha"). Use spatial reasoning and Nigerian electoral context to correctly assign these standalone handwritten strings to "state", "local_government_area", "registration_area", or "polling_unit".
3. For the field "local_government_area", extract the name as it appears on the form and format it using Proper Title Case (e.g., Girei, Hong, Ikeja). Ensure it is spelled cleanly without unnecessary symbols so it can match standard database records.
4. For the field "local_government", you must set it to null. The system will automatically assign the correct ID based on the uploading agent's profile. Do not attempt to guess the ID.
5. For party votes, intelligently match informal writing directly to the correct party acronym (e.g., APC, PDP, LP, ADC) and extract the final vote tally even if it is casually written as "apc 23".
6. Output the result as valid JSON.

Example:

If the form shows "GIREI", "girei", or "Gire i", the output should be properly capitalized:

{
  "local_government_area": "Girei",
  "local_government": null,
  ...
}
`;

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
