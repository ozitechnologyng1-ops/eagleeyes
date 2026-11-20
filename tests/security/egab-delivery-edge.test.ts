import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  createEgabDeliveryHandler,
  verifyEgabSignature,
} from "../../supabase/functions/egab-delivery/handler";

const secret = "synthetic-egab-webhook-secret";
const reference = "01a1cf35-5103-731d-bd20-14fd030fc762";

function signedRequest(event = "bulksms.message.delivered", status = "delivered") {
  const body = JSON.stringify({ event, data: { reference, status } });
  const time = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${time}.${body}`).digest("hex");
  return new Request("https://example.test/functions/v1/egab-delivery", {
    method: "POST",
    headers: { "x-egab-signature": `t=${time},v1=${signature}`, "x-egab-event": event },
    body,
  });
}

describe("Supabase EGAB delivery webhook", () => {
  it("verifies the raw body and rejects altered or stale signatures", async () => {
    const request = signedRequest();
    const raw = new Uint8Array(await request.arrayBuffer());
    expect(await verifyEgabSignature(request.headers.get("x-egab-signature"), raw, secret)).toBe(
      true,
    );
    expect(
      await verifyEgabSignature(
        request.headers.get("x-egab-signature"),
        new TextEncoder().encode("{}"),
        secret,
      ),
    ).toBe(false);
    expect(
      await verifyEgabSignature(
        request.headers.get("x-egab-signature"),
        raw,
        secret,
        Date.now() + 301_000,
      ),
    ).toBe(false);
  });

  it("updates only verified delivered and failed events", async () => {
    const update = vi.fn().mockResolvedValue(true);
    const handler = createEgabDeliveryHandler(() => secret, update);
    expect((await handler(signedRequest())).status).toBe(200);
    expect(update).toHaveBeenCalledWith(reference, "delivered");
    expect((await handler(signedRequest("bulksms.message.failed", "failed"))).status).toBe(200);
    expect(update).toHaveBeenCalledWith(reference, "failed");
    const forged = signedRequest();
    forged.headers.set("x-egab-signature", "t=0000000000,v1=" + "0".repeat(64));
    expect((await handler(forged)).status).toBe(401);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("returns a retryable failure when the status update fails", async () => {
    const handler = createEgabDeliveryHandler(
      () => secret,
      async () => {
        throw new Error("database unavailable");
      },
    );
    expect((await handler(signedRequest())).status).toBe(503);
  });
});
