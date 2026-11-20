const MAX_BODY_BYTES = 64_000;
const referencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

function json(status: number, value: Record<string, unknown>): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function boundedBody(request: Request): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function verifyEgabSignature(
  header: string | null,
  body: Uint8Array,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  if (!/^\d{10}$/.test(parts.t || "") || !/^[0-9a-f]{64}$/.test(parts.v1 || "")) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(parts.t)) > 300) return false;
  const prefix = encoder.encode(`${parts.t}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  const received = Uint8Array.from(parts.v1.match(/.{2}/g)!, (pair) => parseInt(pair, 16));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ received[i];
  return difference === 0;
}

export function createEgabDeliveryHandler(
  getSecret: () => string | undefined,
  updateStatus: (reference: string, status: "delivered" | "failed") => Promise<boolean>,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json(405, { error: "Method not allowed" });
    const secret = getSecret()?.trim();
    if (!secret) return json(503, { error: "Webhook secret is not configured" });
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES)
      return json(413, { error: "Payload too large" });
    const body = await boundedBody(request);
    if (!body) return json(413, { error: "Payload too large" });
    if (!(await verifyEgabSignature(request.headers.get("x-egab-signature"), body, secret))) {
      console.error("EGAB webhook signature rejected");
      return json(401, { error: "Invalid signature" });
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    } catch {
      return json(400, { error: "Invalid JSON" });
    }
    if (!event || typeof event !== "object" || Array.isArray(event))
      return json(400, { error: "Invalid event" });
    const name = request.headers.get("x-egab-event");
    if (name !== event.event) return json(400, { error: "Event header mismatch" });
    if (name === "bulksms.balance.low") return json(200, { ignored: true });
    if (name !== "bulksms.message.delivered" && name !== "bulksms.message.failed")
      return json(200, { ignored: true });
    const status = name === "bulksms.message.delivered" ? "delivered" : "failed";
    const data = event.data as Record<string, unknown> | undefined;
    if (
      !data ||
      typeof data.reference !== "string" ||
      !referencePattern.test(data.reference) ||
      data.status !== status
    )
      return json(400, { error: "Invalid message event" });

    try {
      const matched = await updateStatus(data.reference, status);
      console.log("EGAB webhook accepted", { event: name, matched });
      return json(200, { received: true, matched });
    } catch (error) {
      console.error(
        "EGAB webhook status update failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return json(503, { error: "Delivery update failed" });
    }
  };
}
