import { createEgabDeliveryHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const handler = createEgabDeliveryHandler(
  () => Deno.env.get("EGAB_WEBHOOK_SECRET"),
  async (reference, status) => {
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase configuration missing");
    const url = new URL("/rest/v1/sms_logs", supabaseUrl);
    url.searchParams.set("reference", `eq.${reference}`);
    url.searchParams.set("status", "in.(pending,queued,processing,sent)");
    url.searchParams.set("select", "id");
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`SMS status update HTTP ${response.status}`);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid SMS status update response");
    return rows.length > 0;
  },
);

Deno.serve(handler);
