export const defaultAgentOrigins = [
  "https://ogunadc.com",
  "https://www.ogunadc.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];

export function agentCorsHeaders(req: Request, configuredOrigins?: string): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = configuredOrigins?.trim()
    ? configuredOrigins
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : defaultAgentOrigins;
  if (origin && !allowed.includes(origin)) throw new Error("Origin not allowed");
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-agent-session",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}
