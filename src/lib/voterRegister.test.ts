import { describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "@supabase/supabase-js";
import { formatVoterProgress, queryVoterRegister } from "./voterRegister";

function fixture(
  options: { total?: number; rows?: number; pageStatuses?: number[]; countStatus?: number } = {},
) {
  const requests: { url: URL; method: string; headers: Headers }[] = [];
  const statuses = [...(options.pageStatuses || [200])];
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const method = init?.method || "GET";
        const headers = new Headers(init?.headers);
        requests.push({ url, method, headers });
        const status = method === "HEAD" ? options.countStatus || 200 : statuses.shift() || 200;
        if (status !== 200)
          return new Response(JSON.stringify({ message: "Request failed", code: "57014" }), {
            status,
          });
        return new Response(
          method === "HEAD"
            ? null
            : JSON.stringify(
                Array.from({ length: options.rows ?? 501 }, (_, i) => ({ id: 1501 + i })),
              ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Content-Range": `0-500/${options.total ?? 200000}`,
            },
          },
        );
      },
    },
  });
  return { client, requests };
}

describe("voter register paging and counting", () => {
  it("fetches a bounded page without counting, then requests the exact filtered total separately", async () => {
    const { client, requests } = fixture();
    const result = await queryVoterRegister(
      client,
      { stateId: 24 },
      { lgaId: 9, wardId: 8, puId: 7 },
      2,
    );
    expect(result.total).toBe(200000);
    expect(result.voters).toHaveLength(500);
    expect(result.hasNextPage).toBe(true);
    expect(requests.map((r) => r.method)).toEqual(["GET", "HEAD"]);
    const data = requests[0],
      count = requests[1];
    expect(data.headers.get("prefer") || "").not.toContain("count=exact");
    expect(data.url.searchParams.get("select")).not.toBe("*");
    expect(data.url.searchParams.get("offset")).toBe("500");
    expect(data.url.searchParams.get("limit")).toBe("501");
    expect(count.headers.get("prefer")).toContain("count=exact");
    expect(count.url.searchParams.has("offset")).toBe(false);
    expect(count.url.searchParams.has("limit")).toBe(false);
    for (const request of requests) {
      const p = request.url.searchParams;
      expect(p.get("state_id")).toBe("eq.24");
      expect(p.get("localgovernment_id")).toBe("eq.9");
      expect(p.get("ward_id")).toBe("eq.8");
      expect(p.get("polling_unit_id")).toBe("eq.7");
    }
  });

  it("uses a cursor instead of scanning skipped rows and reuses a known exact count", async () => {
    const { client, requests } = fixture();
    const result = await queryVoterRegister(client, { stateId: 27 }, {}, 100, undefined, {
      afterId: 60000,
      knownTotal: 200000,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url.searchParams.get("id")).toBe("gt.60000");
    expect(requests[0].url.searchParams.has("offset")).toBe(false);
    expect(result.total).toBe(200000);
  });

  it.each([0, 364, 500])(
    "knows the exact first-page total without a count query when all %s matches fit",
    async (rows) => {
      const { client, requests } = fixture({ rows });
      const result = await queryVoterRegister(client, { stateId: 27 }, {}, 1);
      expect(result.total).toBe(rows);
      expect(result.hasNextPage).toBe(false);
      expect(requests).toHaveLength(1);
    },
  );

  it("disables further paging for a full final page without waiting for another count", async () => {
    const { client } = fixture({ rows: 500 });
    const result = await queryVoterRegister(client, {}, {}, 2, undefined, {
      afterId: 1000,
      knownTotal: 1000,
    });
    expect(result.hasNextPage).toBe(false);
    expect(result.total).toBe(1000);
  });

  it("applies all name tokens and assigned boundaries to both data and count requests", async () => {
    const { client, requests } = fixture();
    await queryVoterRegister(
      client,
      { stateId: 27, lgaId: 4 },
      { stateId: 24, searchTerm: "  Ada Obi  ", status: "ADC Supporter" },
      1,
    );
    for (const { url } of requests) {
      const p = url.searchParams;
      expect(p.getAll("state_id")).toEqual(["eq.27", "eq.24"]);
      expect(p.get("localgovernment_id")).toBe("eq.4");
      expect(p.getAll("or")).toEqual([
        '(first_name.ilike."%Ada%",last_name.ilike."%Ada%",phone_number.ilike."%Ada%")',
        '(first_name.ilike."%Obi%",last_name.ilike."%Obi%",phone_number.ilike."%Obi%")',
      ]);
      expect(p.get("status")).toBe("eq.ADC Supporter");
    }
  });

  it("escapes filter syntax and preserves the assigned polling-unit fallback", async () => {
    const { client, requests } = fixture();
    await queryVoterRegister(
      client,
      { stateId: 27, puId: 5, puid: "OG-001" },
      { puId: 99, searchTerm: 'a,b%_(x)"' },
      1,
    );
    for (const { url } of requests) {
      const ors = url.searchParams.getAll("or");
      expect(ors[0]).toBe('(puid.eq."OG-001",polling_unit_id.eq.5)');
      expect(ors[1]).toContain(JSON.stringify('%a,b\\%\\_(x)"%'));
    }
  });

  it("publishes rows before a slow count finishes and keeps them when the count fails", async () => {
    let releaseCount: ((response: Response) => void) | undefined;
    const onPage = vi.fn();
    const client = createClient("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (_input, init) => {
          if (init?.method === "HEAD")
            return new Promise<Response>((resolve) => {
              releaseCount = resolve;
            });
          return new Response(
            JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ id: i + 1 }))),
            { status: 200 },
          );
        },
      },
    });
    const pending = queryVoterRegister(client, {}, {}, 1, undefined, { onPage });
    await vi.waitFor(() => expect(releaseCount).toBeDefined());
    expect(onPage).toHaveBeenCalledWith(
      expect.objectContaining({ hasNextPage: true, voters: expect.any(Array) }),
    );
    expect(onPage.mock.calls[0][0].voters).toHaveLength(500);
    releaseCount!(
      new Response(JSON.stringify({ message: "Count timed out", code: "57014" }), { status: 500 }),
    );
    const result = await pending;
    expect(result.voters).toHaveLength(500);
    expect(result.total).toBeNull();
    expect(result.countError).toMatchObject({ code: "57014" });
  });

  it("does not apply a page cursor to the total count", async () => {
    const { client, requests } = fixture();
    await queryVoterRegister(client, {}, {}, 2, undefined, { afterId: 9999 });
    expect(requests[0].url.searchParams.get("id")).toBe("gt.9999");
    expect(requests[1].url.searchParams.has("id")).toBe(false);
  });

  it("rejects invalid pages and cursors before sending requests", async () => {
    const { client, requests } = fixture();
    await expect(queryVoterRegister(client, {}, {}, 0)).rejects.toThrow("Invalid voter page");
    await expect(queryVoterRegister(client, {}, {}, 1, undefined, { afterId: -1 })).rejects.toThrow(
      "Invalid voter cursor",
    );
    expect(requests).toHaveLength(0);
  });

  it("cancels a pending count instead of returning its stale total", async () => {
    const controller = new AbortController();
    const onPage = vi.fn();
    let countStarted = false;
    const client = createClient("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (_input, init) => {
          if (init?.method === "HEAD") {
            countStarted = true;
            return new Promise<Response>((_resolve, reject) => {
              const abort = () => reject(new DOMException("Cancelled", "AbortError"));
              if (init.signal?.aborted) abort();
              else init.signal?.addEventListener("abort", abort, { once: true });
            });
          }
          return new Response(
            JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ id: i + 1 }))),
            { status: 200 },
          );
        },
      },
    });
    const pending = queryVoterRegister(client, {}, {}, 1, controller.signal, { onPage });
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(countStarted).toBe(true));
    controller.abort();
    await rejected;
    expect(onPage).toHaveBeenCalledTimes(1);
  });
});

describe("voter request recovery", () => {
  it("retries temporary row failures once", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = fixture({ rows: 0, pageStatuses: [503, 200] });
      const result = queryVoterRegister(client, {}, {}, 1);
      await vi.advanceTimersByTimeAsync(800);
      await expect(result).resolves.toMatchObject({ total: 0 });
      expect(requests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops after a second temporary failure", async () => {
    vi.useFakeTimers();
    try {
      const { client, requests } = fixture({ pageStatuses: [503, 503] });
      const result = expect(queryVoterRegister(client, {}, {}, 1)).rejects.toMatchObject({
        status: 503,
      });
      await vi.advanceTimersByTimeAsync(800);
      await result;
      expect(requests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([400, 401, 403, 500])("does not retry permanent row errors (%s)", async (status) => {
    const { client, requests } = fixture({ pageStatuses: [status] });
    await expect(queryVoterRegister(client, {}, {}, 1)).rejects.toMatchObject({ status });
    expect(requests).toHaveLength(1);
  });

  it("does not send any requests for an already-aborted search", async () => {
    const { client, requests } = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(queryVoterRegister(client, {}, {}, 1, controller.signal)).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });
});

describe("voter progress", () => {
  it("distinguishes an unknown total from a confirmed empty result", () => {
    expect(formatVoterProgress(1, 500, null)).toBe("500");
    expect(formatVoterProgress(1, 0, 0)).toBe("0");
    expect(formatVoterProgress(1, 500, 200000)).toBe("500 / 200,000");
    expect(formatVoterProgress(2, 500, 200000)).toBe("1,000 / 200,000");
    expect(formatVoterProgress(3, 23, 1023)).toBe("1,023 / 1,023");
    expect(formatVoterProgress(1, 364, 364)).toBe("364");
  });
});
