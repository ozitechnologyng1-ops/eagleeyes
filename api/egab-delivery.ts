import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const referencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function verifyEgabDelivery(
  header: string | null,
  body: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  if (!/^\d{10}$/.test(parts.t || "") || !/^[0-9a-f]{64}$/.test(parts.v1 || "")) return false;
  if (Math.abs(now / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, "hex"));
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.EGAB_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !supabaseUrl || !supabaseKey)
    return Response.json({ error: "Delivery tracking is not configured" }, { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > 64_000)
    return Response.json({ error: "Payload too large" }, { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 64_000)
    return Response.json({ error: "Payload too large" }, { status: 413 });
  if (!verifyEgabDelivery(request.headers.get("x-egab-signature"), body, secret))
    return Response.json({ error: "Invalid signature" }, { status: 401 });

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event || typeof event !== "object" || Array.isArray(event))
    return Response.json({ error: "Invalid event" }, { status: 400 });
  const eventName = request.headers.get("x-egab-event");
  if (
    eventName !== event.event ||
    !["bulksms.message.delivered", "bulksms.message.failed"].includes(eventName || "")
  )
    return Response.json({ ignored: true });
  const data = event.data as Record<string, unknown> | undefined;
  const status = eventName === "bulksms.message.delivered" ? "delivered" : "failed";
  if (
    !data ||
    typeof data.reference !== "string" ||
    !referencePattern.test(data.reference) ||
    data.status !== status
  )
    return Response.json({ error: "Invalid message event" }, { status: 400 });

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client
    .from("sms_logs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("reference", data.reference)
    .in("status", ["pending", "queued", "processing", "sent"]);
  if (error) {
    console.error("[EGAB SMS] Delivery update failed", error.message);
    return Response.json({ error: "Delivery update failed" }, { status: 503 });
  }
  return Response.json({ received: true });
}
