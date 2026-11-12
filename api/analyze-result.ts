export const config = { maxDuration: 60 };

const sessionPattern = /^[a-f0-9]{64}$/;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = req.headers?.["x-agent-session"];
  if (typeof token !== "string" || !sessionPattern.test(token))
    return res.status(401).json({ error: "Sign in to scan a result" });
  const { imageBase64, mimeType } = req.body || {};
  if (
    typeof imageBase64 !== "string" ||
    imageBase64.length > 4_000_004 ||
    !imageTypes.has(mimeType)
  )
    return res.status(400).json({ error: "Upload a JPEG, PNG, or WebP image under 3 MB" });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ error: "Result scanning is not configured" });
  try {
    const upstream = await fetch(`${url.replace(/\/$/, "")}/functions/v1/analyze-result`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "x-agent-session": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64, mimeType }),
      signal: AbortSignal.timeout(58_000),
    });
    const data = await upstream.json().catch(() => null);
    return res.status(upstream.status).json(data || { error: "Invalid scan response" });
  } catch (error) {
    console.error(
      "Result scan proxy unavailable",
      error instanceof Error ? error.name : "UnknownError",
    );
    return res.status(502).json({ error: "Image analysis failed. Retry with the same photo." });
  }
}
