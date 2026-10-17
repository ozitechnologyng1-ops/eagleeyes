import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { fixtureSchema, whatsappSchema } from "./schema";
import { sha256 } from "../../supabase/functions/_shared/agent-security";
import {
  createAgentAuthHandler,
  type AuthClient,
} from "../../supabase/functions/agent-auth/handler";
import { verifyAgentSession } from "../../supabase/functions/_shared/verify-agent-session";

const patches = [
  "01-destructive-rpcs",
  "02-voter-insert",
  "04-direct-deletion",
  "05-agent-sessions",
  "06-verified-agent-authorization",
  "07-scoped-rpcs",
  "09-agent-action-limits",
];
const sql = (name: string, direction = "forward") =>
  readFileSync(
    new URL(`../../supabase/security/${name}.${direction}.sql`, import.meta.url),
    "utf8",
  );
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const token = (n: number) => n.toString(16).repeat(64);
let pg: PGlite;

const rpcSql: Record<string, string> = {
  agent_login_attempt: "SELECT public.agent_login_attempt($1) result",
  agent_session_issue: "SELECT public.agent_session_issue($1,$2,$3) result",
  agent_session_resolve: "SELECT public.agent_session_resolve($1) result",
  agent_session_revoke: "SELECT public.agent_session_revoke($1) result",
};
const client: AuthClient = {
  async rpc(name, args) {
    const query = rpcSql[name];
    if (!query) throw new Error("Unexpected RPC");
    const result = await pg.query<{ result: unknown }>(query, Object.values(args));
    return { data: result.rows[0].result, error: null };
  },
  async credential(phone) {
    const result = await pg.query<{
      id: string;
      role: string;
      status: string;
      password_hash: string;
    }>("SELECT id,role,status,password_hash FROM public.agents WHERE phone=$1", [phone]);
    return {
      data: result.rows[0] ?? null,
      error: result.rows.length > 1 ? new Error("Ambiguous phone") : null,
    };
  },
};
const handler = createAgentAuthHandler({
  corsHeaders: () => ({}),
  serviceClient: () => client,
  requireAgent: verifyAgentSession,
});
const request = (body: Record<string, unknown>, session?: string) =>
  new Request("https://synthetic.invalid/agent-auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(session ? { "x-agent-session": session } : {}),
    },
    body: JSON.stringify(body),
  });

async function asAgent(n: number | null, forgedId?: string) {
  await pg.exec("SET LOCAL ROLE anon");
  await pg.query("SELECT set_config('request.headers',$1,true)", [
    JSON.stringify({
      ...(n ? { "x-agent-session": token(n) } : {}),
      ...(forgedId ? { "x-agent-id": forgedId, "x-agent-phone": "08000000003" } : {}),
    }),
  ]);
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(fixtureSchema);
  await pg.exec(whatsappSchema);
  await pg.exec(readFileSync(new URL("./fixtures/baseline.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("./fixtures/whatsapp-baseline.sql", import.meta.url), "utf8"));
  for (const patch of patches) await pg.exec(sql(patch));
  for (let n = 1; n <= 6; n++)
    await pg.query("SELECT public.agent_session_issue($1,$2,$3)", [
      id(n),
      await sha256(token(n)),
      await sha256("a".repeat(64)),
    ]);
}, 60000);
beforeEach(async () => {
  await pg.exec("BEGIN");
});
afterEach(async () => {
  await pg.exec("ROLLBACK");
});
afterAll(async () => {
  await pg?.close();
});

describe("custom-agent authorization against synthetic PostgreSQL data", () => {
  it.each([
    [2, 24, [1, 2]],
    [3, 27, [3]],
  ])(
    "logs in fixture %s through the real handler and preserves its state boundary",
    async (agent, state, expected) => {
      const phone = `0800000000${agent}`;
      const password = "synthetic-login-password";
      await pg.query("UPDATE public.agents SET phone=$1,password_hash=$2 WHERE id=$3", [
        phone,
        await sha256(password),
        id(agent as number),
      ]);
      const response = await handler(request({ action: "login", phone, password }));
      expect(response.status).toBe(200);
      const login = await response.json();
      expect(login.expiresAt).toBeNull();
      expect(login.agent.state_id).toBe(state);
      expect(login.agent).not.toHaveProperty("password_hash");
      expect(login.agent).not.toHaveProperty("pass");
      const stored = await pg.query<{ token_hash: string; expires_at: null }>(
        "SELECT token_hash,expires_at FROM eagle_security.agent_sessions WHERE token_hash=$1",
        [await sha256(login.token)],
      );
      expect(stored.rows[0]).toEqual({ token_hash: await sha256(login.token), expires_at: null });
      expect(stored.rows[0].token_hash).not.toBe(login.token);
      await pg.query(
        "UPDATE eagle_security.agent_sessions SET created_at=now()-interval '1 year' WHERE token_hash=$1",
        [await sha256(login.token)],
      );
      expect((await handler(request({ action: "me" }, login.token))).status).toBe(200);
      await pg.exec("SET LOCAL ROLE anon");
      await pg.query("SELECT set_config('request.headers',$1,true)", [
        JSON.stringify({ "x-agent-session": login.token, "x-agent-id": id(agent === 2 ? 3 : 2) }),
      ]);
      expect(
        (await pg.query<{ id: number }>("SELECT id FROM public.voters ORDER BY id")).rows.map(
          (row) => row.id,
        ),
      ).toEqual(expected);
      await pg.exec("RESET ROLE");
      expect((await handler(request({ action: "logout" }, login.token))).status).toBe(200);
      expect((await handler(request({ action: "me" }, login.token))).status).toBe(401);
    },
  );

  it.each(["wrong-password", "missing-account", "hashless", "suspended"])(
    "rejects %s login without creating a session",
    async (scenario) => {
      const password = "synthetic-login-password";
      await pg.query(
        "UPDATE public.agents SET phone='08000000002',password_hash=$1,status=$2 WHERE id=$3",
        [
          scenario === "hashless" ? null : await sha256(password),
          scenario === "suspended" ? "Suspended" : "Active",
          id(2),
        ],
      );
      const response = await handler(
        request({
          action: "login",
          phone: scenario === "missing-account" ? "08000000999" : "08000000002",
          password: scenario === "wrong-password" ? "incorrect" : password,
        }),
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Invalid phone or password" });
      expect(
        (await pg.query("SELECT token_hash FROM eagle_security.agent_sessions")).rows,
      ).toHaveLength(6);
    },
  );

  it("reports verification outages as temporary errors, not revoked sessions", async () => {
    const failingClient: AuthClient = {
      ...client,
      rpc: async () => ({ data: null, error: new Error("Database unavailable") }),
    };
    const failingHandler = createAgentAuthHandler({
      corsHeaders: () => ({}),
      serviceClient: () => failingClient,
      requireAgent: verifyAgentSession,
    });
    expect((await failingHandler(request({ action: "me" }, token(2)))).status).toBe(503);
  });

  it("rate limits repeated incorrect passwords without issuing sessions", async () => {
    for (let n = 0; n < 10; n++)
      expect(
        (await handler(request({ action: "login", phone: "08000000999", password: "incorrect" })))
          .status,
      ).toBe(401);
    expect(
      (await handler(request({ action: "login", phone: "08000000999", password: "incorrect" })))
        .status,
    ).toBe(429);
  });

  it("blocks both destructive RPCs and sequence resets while retaining normal sequence use", async () => {
    const result = await pg.query<{
      role: string;
      wipe: boolean;
      reset: boolean;
      sequence_update: boolean;
      sequence_usage: boolean;
    }>(`
      SELECT role,has_function_privilege(role,'public.wipe_voters_table()','EXECUTE') wipe,
      has_function_privilege(role,'public.reset_voters_sequence()','EXECUTE') reset,
      has_sequence_privilege(role,'public.voters_id_seq','UPDATE') sequence_update,
      has_sequence_privilege(role,'public.voters_id_seq','USAGE') sequence_usage
      FROM (VALUES ('anon'),('authenticated'),('service_role')) r(role)`);
    expect(result.rows).toEqual([
      { role: "anon", wipe: false, reset: false, sequence_update: false, sequence_usage: true },
      {
        role: "authenticated",
        wipe: false,
        reset: false,
        sequence_update: false,
        sequence_usage: true,
      },
      {
        role: "service_role",
        wipe: true,
        reset: true,
        sequence_update: true,
        sequence_usage: true,
      },
    ]);
  });

  it("ignores forged agent IDs and phone headers without a valid session", async () => {
    await asAgent(null, id(3));
    expect((await pg.query("SELECT id FROM public.voters")).rows).toEqual([]);
    expect((await pg.query("SELECT id FROM public.agents")).rows).toEqual([]);
    expect(
      (await pg.query<{ id: string | null }>("SELECT public.current_agent_id() id")).rows[0].id,
    ).toBeNull();
  });

  it.each([
    [2, [1, 2]],
    [3, [3]],
    [4, [1, 2]],
    [5, [1, 2]],
    [6, [1]],
  ])("scopes role fixture %s and resists an opposite-state header", async (agent, expected) => {
    await asAgent(agent as number, id(agent === 3 ? 2 : 3));
    expect(
      (await pg.query<{ id: number }>("SELECT id FROM public.voters ORDER BY id")).rows.map(
        (r) => r.id,
      ),
    ).toEqual(expected);
  });

  it("allows national visibility and preserves pagination within state", async () => {
    await asAgent(1);
    expect((await pg.query("SELECT id FROM public.voters")).rows).toHaveLength(3);
    await asAgent(2);
    expect(
      (await pg.query("SELECT id FROM public.voters ORDER BY id LIMIT 1 OFFSET 1")).rows,
    ).toEqual([{ id: 2 }]);
  });

  it("scopes count RPCs even when an opposite-state polling-unit identifier is supplied", async () => {
    await asAgent(2);
    expect(
      (
        await pg.query<{ count: number }>(
          "SELECT public.get_voters_count(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'TEST-OGUN-A')::int count",
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await pg.query<{ count: number }>(
          "SELECT public.get_voters_count(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)::int count",
        )
      ).rows[0].count,
    ).toBe(2);
    expect(
      (
        await pg.query(
          "SELECT * FROM public.get_voter_status_counts(27,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)",
        )
      ).rows,
    ).toEqual([]);
  });

  it("blocks exposed password columns even for an authenticated custom agent", async () => {
    await asAgent(2);
    await expect(pg.query("SELECT password_hash FROM public.agents")).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("blocks direct role elevation and anonymous voter inserts", async () => {
    await asAgent(2);
    await expect(
      pg.query("UPDATE public.agents SET role='national_admin' WHERE id=$1", [id(2)]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("blocks the former unrestricted voter insertion policy", async () => {
    await asAgent(null);
    await expect(
      pg.query("INSERT INTO public.voters(id,state_id) VALUES (999,27)"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("blocks forged, expired and revoked sessions", async () => {
    await pg.query(
      "UPDATE eagle_security.agent_sessions SET expires_at=now()-interval '1 second' WHERE agent_id=$1",
      [id(2)],
    );
    await pg.query("UPDATE eagle_security.agent_sessions SET revoked_at=now() WHERE agent_id=$1", [
      id(3),
    ]);
    for (const agent of [2, 3, 9]) {
      await asAgent(agent);
      expect((await pg.query("SELECT id FROM public.voters")).rows).toEqual([]);
    }
  });

  it("revokes access immediately after password change or suspension", async () => {
    await pg.query("UPDATE public.agents SET password_hash=repeat('b',64) WHERE id=$1", [id(2)]);
    await pg.query("UPDATE public.agents SET status='Suspended' WHERE id=$1", [id(3)]);
    for (const agent of [2, 3]) {
      await asAgent(agent);
      expect((await pg.query("SELECT id FROM public.voters")).rows).toEqual([]);
    }
  });

  it("permits a state administrator to manage lower roles in the same state", async () => {
    const result = await pg.query<{ agent: Record<string, unknown> }>(
      "SELECT public.agent_write_secure($1,$2,$3) agent",
      [await sha256(token(2)), id(4), { name: "Synthetic updated LGA" }],
    );
    expect(result.rows[0].agent.name).toBe("Synthetic updated LGA");
    expect(result.rows[0].agent).not.toHaveProperty("password_hash");
    expect(result.rows[0].agent).not.toHaveProperty("pass");
  });

  it.each([
    [2, 2, { role: "national_admin" }],
    [2, 3, { name: "Cross-state change" }],
    [4, 5, { role: "state_admin" }],
    [2, 4, { state_id: 27, local_governments_id: 271 }],
    [6, 5, { name: "Higher role change" }],
  ])(
    "rejects privilege escalation and scope changes (%s â†’ %s)",
    async (caller, target, values) => {
      await expect(
        pg.query("SELECT public.agent_write_secure($1,$2,$3)", [
          await sha256(token(caller)),
          id(target),
          values,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    },
  );

  it("permits profile edits without allowing credentials or earnings to be supplied", async () => {
    const result = await pg.query<{ agent: { first_name: string } }>(
      "SELECT public.agent_write_secure($1,$2,$3) agent",
      [await sha256(token(6)), id(6), { first_name: "Synthetic profile" }],
    );
    expect(result.rows[0].agent.first_name).toBe("Synthetic profile");
    await expect(
      pg.query("SELECT public.agent_write_secure($1,$2,$3)", [
        await sha256(token(6)),
        id(6),
        { whatsapp_earnings_balance: 999999 },
      ]),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("evaluates voter identity independently of individual voter rows", async () => {
    await asAgent(2);
    const plan = await pg.query("EXPLAIN SELECT id FROM public.voters WHERE state_id=24 LIMIT 50");
    const text = JSON.stringify(plan.rows);
    expect(text).toContain("InitPlan");
    expect(text).not.toContain("agent_scope_allows(state_id");
  });

  it("creates a lower-role agent without leaking its credential fields", async () => {
    const result = await pg.query<{ agent: Record<string, unknown> }>(
      "SELECT public.agent_write_secure($1,NULL,$2) agent",
      [
        await sha256(token(2)),
        {
          name: "Synthetic new agent",
          phone: "08000000099",
          role: "pu_agent",
          state_id: 24,
          local_governments_id: 241,
          wards_id: 2411,
          polling_units_id: 24111,
          password_hash: `pbkdf2-sha256$600000$${"a".repeat(32)}$${"b".repeat(64)}`,
        },
      ],
    );
    expect(result.rows[0].agent.role).toBe("pu_agent");
    expect(result.rows[0].agent).not.toHaveProperty("password_hash");
  });

  it("rejects duplicate login phone numbers", async () => {
    await expect(
      pg.query("SELECT public.agent_write_secure($1,$2,$3)", [
        await sha256(token(2)),
        id(4),
        { phone: "08000000005" },
      ]),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it.each(["agent_write_secure(text,uuid,jsonb)", "agent_action_attempt(text,text)"])(
    "restricts privileged operation %s to server calls",
    async (signature) => {
      expect(
        (await pg.query("SELECT has_function_privilege('anon',$1,'execute') allowed", [signature]))
          .rows,
      ).toEqual([{ allowed: false }]);
      expect(
        (
          await pg.query("SELECT has_function_privilege('service_role',$1,'execute') allowed", [
            signature,
          ])
        ).rows,
      ).toEqual([{ allowed: true }]);
    },
  );

  it("enforces per-agent limits and rejects unknown or unauthenticated actions", async () => {
    const attempt = async (hash: string, action: string) =>
      (
        await pg.query<{ allowed: boolean }>("SELECT public.agent_action_attempt($1,$2) allowed", [
          hash,
          action,
        ])
      ).rows[0].allowed;
    const hash = await sha256(token(2));
    expect(await attempt("invalid", "agent-admin")).toBe(false);
    expect(await attempt(hash, "unknown-action")).toBe(false);
    for (let n = 0; n < 10; n++) expect(await attempt(hash, "agent-admin")).toBe(true);
    expect(await attempt(hash, "agent-admin")).toBe(false);
    expect(await attempt(await sha256(token(3)), "agent-admin")).toBe(true);
  });

  it("retains authorized WhatsApp reads with the new shared identity", async () => {
    await pg.exec(
      "INSERT INTO whatsapp_state_config(state_id,daily_outreach_max) VALUES(24,10),(27,20)",
    );
    await asAgent(2);
    expect((await pg.query("SELECT state_id FROM whatsapp_state_config")).rows).toEqual([
      { state_id: 24 },
    ]);
    await asAgent(3);
    expect((await pg.query("SELECT state_id FROM whatsapp_state_config")).rows).toEqual([
      { state_id: 27 },
    ]);
  });

  it("preserves all seeded records and existing PostgreSQL objects during patch application", async () => {
    expect((await pg.query("SELECT id FROM public.voters")).rows).toHaveLength(3);
    expect((await pg.query("SELECT id FROM public.agents")).rows).toHaveLength(6);
    expect(
      (
        await pg.query<{ n: number }>(
          "SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'",
        )
      ).rows[0].n,
    ).toBe(22);
  });
});
