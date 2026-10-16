import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const reply = (status: number, error: string) => {
    res.statusCode = status;
    res.end(JSON.stringify({ error }));
  };
  if (req.method !== "POST") return reply(405, "Method not allowed");
  const token = req.headers["x-agent-session"];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    return reply(401, "Session required");
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return reply(503, "Authenticated SMS service is not configured");
  try {
    let body = req.body;
    if (!body) {
      let raw = "";
      for await (const chunk of req) {
        raw += String(chunk);
        if (Buffer.byteLength(raw) > 16384) return reply(413, "Request too large");
      }
      body = JSON.parse(raw);
    } else if (typeof body === "string") body = JSON.parse(body);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply(400, "Invalid request");
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized) > 16384) return reply(413, "Request too large");
    const upstream = await fetch(new URL("/functions/v1/agent-sms", url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        "x-agent-session": token,
      },
      body: serialized,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    const data = await upstream.json();
    res.statusCode = upstream.status;
    res.end(JSON.stringify(data));
  } catch {
    return reply(503, "SMS service temporarily unavailable");
  }
}
