import { createHash, createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vite-plus/test";
import {
  signEgab,
  createEgabClient,
  normalizeNigerianPhone,
  estimateSmsSegments,
  egabConfig,
} from "../../supabase/functions/_shared/egab";
import {
  createSmsService,
  loginMessage,
  type SmsStore,
} from "../../supabase/functions/_shared/agent-sms";

const config = { base: "https://example.invalid", key: "pk_test", secret: "sk_synthetic" };
const env = (key: string): string | undefined =>
  ({ EGAB_BASE: config.base, EGAB_KEY: config.key, EGAB_SECRET: config.secret })[
    key as "EGAB_BASE"
  ];
const id = "00000000-0000-4000-8000-000000000001";
const now = () => Date.parse("2026-10-21T12:00:00Z");
function fixture() {
  const rows = new Map<string, Awaited<ReturnType<SmsStore["reserve"]>>>();
  const store: SmsStore = {
    reserve: vi.fn(async (row) => {
      if (!rows.has(row.id))
        rows.set(row.id, { ...row, created_at: new Date(now()).toISOString(), result: null });
      return rows.get(row.id)!;
    }),
    save: vi.fn(async (key, result) => {
      Object.assign(rows.get(key)!, { status: result.status, reference: result.reference, result });
    }),
  };
  const transport = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            reference: "message-reference",
            status: "pending",
            sender_id: "EagleEye",
            message_category: "transactional",
          },
          meta: { request_id: "trace-1" },
        }),
        { status: 201 },
      ),
  );
  return { rows, store, transport, sms: createSmsService(store, env, transport, now) };
}

describe("EGAB signing and transport", () => {
  it("identifies HTML 406 errors while redacting keys, signatures and phone numbers", async () => {
    const signature = "a".repeat(64);
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(
          `<html><title>Not Acceptable</title><p>Mod_Security blocked the request egab_sk_test_synthetic ${signature} 08031234567</p></html>`,
          { status: 406, headers: { "Content-Type": "text/html", Server: "Apache" } },
        ),
    );
    const error = await createEgabClient(config, transport)(
      "POST",
      "/api/v1/bulksms/sms",
      "{}",
      id,
    ).catch((error: unknown) => error);
    expect(error).toMatchObject({
      status: 406,
      code: "HTTP_406",
      diagnostics: {
        server: "Apache",
        content_type: "text/html",
        error_page:
          "Not Acceptable Mod_Security blocked the request [redacted-key] [redacted-digest] [redacted-number]",
      },
    });
  });
  it("preserves request IDs on authentication errors that only expose a response header", async () => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response('{"error":"invalid_api_key"}', {
          status: 401,
          headers: { "X-Request-Id": "auth-trace" },
        }),
    );
    await expect(
      createEgabClient(config, transport)("GET", "/api/v1/bulksms/balance"),
    ).rejects.toMatchObject({ code: "invalid_api_key", requestId: "auth-trace" });
  });
  it("accepts branded test keys unchanged and rejects test/live mixing", () => {
    const values: Record<string, string> = {
      EGAB_BASE: config.base,
      EGAB_KEY: "egab_pk_test_synthetic",
      EGAB_SECRET: "egab_sk_test_synthetic",
    };
    expect(egabConfig((key) => values[key])).toEqual({
      base: config.base,
      key: values.EGAB_KEY,
      secret: values.EGAB_SECRET,
    });
    values.EGAB_SECRET = "egab_sk_live_synthetic";
    expect(() => egabConfig((key) => values[key])).toThrow("same test or live pair");
    values.EGAB_KEY = "egab_sk_test_synthetic";
    expect(() => egabConfig((key) => values[key])).toThrow("public key");
  });
  it("normalizes the documented SMS endpoint as a base without duplicating its path", () => {
    expect(
      egabConfig((key) =>
        key === "EGAB_BASE" ? "https://egabsms.com/api/v1/bulksms/sms" : env(key),
      ).base,
    ).toBe("https://egabsms.com");
    expect(() =>
      egabConfig((key) => (key === "EGAB_BASE" ? "https://egabsms.com/unexpected" : env(key))),
    ).toThrow("HTTPS host");
  });
  it("matches independent HMAC for exact Unicode bytes and normalized path", async () => {
    const raw = '{"message": "Hello ₦", "to":"08031234567"}';
    const canonical = [
      "POST",
      "/api/v1/bulksms/sms",
      createHash("sha256").update(raw).digest("hex"),
      "1792584000",
    ].join("\n");
    expect(
      await signEgab("post", "///api/v1/bulksms/sms?q=1", raw, "1792584000", config.secret),
    ).toBe(createHmac("sha256", config.secret).update(canonical).digest("hex"));
  });
  it("transmits signed bytes, refreshes signatures and preserves the retry key", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response('{"data":{}}', { status: 201 }));
    let time = 1792584000000;
    const client = createEgabClient(config, transport, () => {
      time += 1000;
      return time;
    });
    const raw = '{ "to": "08031234567", "message": "Test" }';
    await client("POST", "/api/v1/bulksms/sms", raw, id);
    await client("POST", "/api/v1/bulksms/sms", raw, id);
    const first = transport.mock.calls[0][1]!;
    const second = transport.mock.calls[1][1]!;
    expect(first.body).toBe(raw);
    const headers = first.headers as Record<string, string>;
    expect(headers["X-Egab-Signature"]).toBe(
      await signEgab(
        "POST",
        "/api/v1/bulksms/sms",
        raw,
        headers["X-Egab-Timestamp"],
        config.secret,
      ),
    );
    expect((second.headers as Record<string, string>)["Idempotency-Key"]).toBe(id);
    expect((second.headers as Record<string, string>)["X-Egab-Timestamp"]).not.toBe(
      headers["X-Egab-Timestamp"],
    );
    expect(Object.values(headers)).not.toContain(config.secret);
    expect(headers["X-Egab-Timestamp"]).toHaveLength(10);
  });
  it("signs empty GET bodies and refuses missing credentials or insecure hosts", async () => {
    expect(await signEgab("GET", "/balance", "", "1", config.secret)).toBe(
      createHmac("sha256", config.secret)
        .update("GET\n/balance\n" + createHash("sha256").update("").digest("hex") + "\n1")
        .digest("hex"),
    );
    expect(() => egabConfig(() => undefined)).toThrow("not configured");
    expect(() =>
      egabConfig((key) => (key === "EGAB_BASE" ? "http://example.invalid" : env(key))),
    ).toThrow("HTTPS");
  });
  it.each([
    [401, "invalid_api_key"],
    [403, "insufficient_scope"],
    [402, "INSUFFICIENT_UNITS"],
    [422, "sender_id_type_mismatch"],
  ])("handles HTTP %s and preserves error code and trace", async (status, code) => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: status === 401 || status === 403 ? code : { code },
            meta: { request_id: "trace-2" },
          }),
          { status },
        ),
    );
    await expect(
      createEgabClient(config, transport)("POST", "/sms", "{}", id),
    ).rejects.toMatchObject({ status, code, requestId: "trace-2" });
  });
});

describe("SMS workflow", () => {
  it("stores actual metadata and returns pending; repeats do not send again", async () => {
    const { sms, store, transport } = fixture();
    expect(await sms.submit(id, "actor", "agent", "08031234567", "Test")).toMatchObject({
      id,
      reference: "message-reference",
      status: "pending",
      sender_id: "EagleEye",
      message_category: "transactional",
      request_id: "trace-1",
      segments: 1,
    });
    expect(store.save).toHaveBeenCalled();
    expect(JSON.parse(transport.mock.calls[0][1]!.body as string)).toEqual({
      to: "+2348031234567",
      message: "Test",
    });
    await sms.submit(id, "actor", "agent", "08031234567", "Test");
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(sms.submit(id, "actor", "agent", "08031234567", "Changed")).rejects.toThrow(
      "another request",
    );
    await expect(sms.submit(id, "other-actor", "agent", "08031234567", "Test")).rejects.toThrow(
      "another request",
    );
  });
  it("retains uncertain outcomes and retries with the same key; blocks expired retries", async () => {
    const { sms, rows, transport } = fixture();
    transport.mockRejectedValueOnce(new Error("timeout"));
    expect(await sms.submit(id, "actor", null, "08031234567", "Test")).toMatchObject({
      status: "unknown",
    });
    expect(await sms.submit(id, "actor", null, "08031234567", "Test")).toMatchObject({
      status: "pending",
    });
    expect(transport.mock.calls[1][1]!.headers).toMatchObject({ "Idempotency-Key": id });
    Object.assign(rows.get(id)!, {
      reference: undefined,
      status: "unknown",
      created_at: "2026-10-20T00:00:00Z",
    });
    await expect(sms.submit(id, "actor", null, "08031234567", "Test")).rejects.toThrow(
      "window expired",
    );
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("blocks credential sends with a promotional default before POST", async () => {
    const { sms, transport } = fixture();
    transport.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ sender_id: "Ads", is_default: true, type: "promotional", status: "approved" }],
          }),
          { status: 200 },
        ),
    );
    expect(
      await sms.submit(id, "actor", "agent", "08031234567", "Credentials", true),
    ).toMatchObject({ status: "rejected", code: "sender_id_type_mismatch" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("sends credential messages with an approved transactional default", async () => {
    const { sms, transport } = fixture();
    transport.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                sender_id: "EagleEye",
                is_default: true,
                type: "transactional",
                status: "approved",
              },
            ],
          }),
          { status: 200 },
        ),
    );
    expect(
      await sms.submit(id, "actor", "agent", "08031234567", "Credentials", true),
    ).toMatchObject({ status: "pending" });
    expect(transport.mock.calls[1][1]!.method).toBe("POST");
  });
  it("fails closed before sending if tracking cannot persist", async () => {
    const { store, transport } = fixture();
    vi.mocked(store.reserve).mockRejectedValueOnce(new Error("tracking unavailable"));
    await expect(
      createSmsService(store, env, transport).submit(id, "actor", null, "08031234567", "Test"),
    ).rejects.toThrow("tracking unavailable");
    expect(transport).not.toHaveBeenCalled();
  });
  it("uses stored references for lookup and saves confirmed delivery", async () => {
    const { sms, rows, transport, store } = fixture();
    await sms.submit(id, "actor", null, "08031234567", "Test");
    transport.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            data: { status: "delivered", sender_id: "EagleEye", message_category: "transactional" },
          }),
          { status: 200 },
        ),
    );
    expect(await sms.status(rows.get(id)!)).toMatchObject({ status: "delivered" });
    expect(transport.mock.calls[1][0]).toBe(config.base + "/api/v1/bulksms/sms/message-reference");
    expect(store.save).toHaveBeenLastCalledWith(
      id,
      expect.objectContaining({ status: "delivered" }),
    );
  });
  it("uses the allowed registration URL and refuses unapproved sites", () => {
    expect(
      loginMessage(
        "Test",
        "08031234567",
        "synthetic",
        new Request("https://edge.invalid", { headers: { origin: "https://ogunadc.com" } }),
      ),
    ).toContain("https://ogunadc.com/login");
    expect(() =>
      loginMessage(
        "Test",
        "08031234567",
        "synthetic",
        new Request("https://edge.invalid", { headers: { origin: "https://evil.invalid" } }),
      ),
    ).toThrow("Origin");
  });
  it("normalizes Nigerian formats and estimates extension and Unicode segments", () => {
    for (const phone of ["08031234567", "+2348031234567", "2348031234567"])
      expect(normalizeNigerianPhone(phone)).toBe("+2348031234567");
    expect(() => normalizeNigerianPhone("0803x1234567")).toThrow();
    expect(estimateSmsSegments("a".repeat(161)).segments).toBe(2);
    expect(estimateSmsSegments("^".repeat(81)).segments).toBe(2);
    expect(estimateSmsSegments("’".repeat(71))).toEqual({ encoding: "Unicode", segments: 2 });
  });
});
