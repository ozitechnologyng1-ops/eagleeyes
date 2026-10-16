import { it, expect } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { fixtureSchema, whatsappSchema } from "./schema";

it("restores baseline security definitions and permissions without changing fixture records", async () => {
  const pg = new PGlite();
  const patches = [
    "01-destructive-rpcs",
    "02-voter-insert",
    "04-direct-deletion",
    "05-agent-sessions",
    "06-verified-agent-authorization",
    "07-scoped-rpcs",
    "09-private-operations",
  ];
  try {
    await pg.exec(fixtureSchema + whatsappSchema);
    for (const file of ["baseline", "whatsapp-baseline"])
      await pg.exec(readFileSync(new URL(`./fixtures/${file}.sql`, import.meta.url), "utf8"));
    const policies =
      "SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname";
    const records =
      "SELECT jsonb_build_object('agents',(SELECT jsonb_agg(a ORDER BY id) FROM agents a),'voters',(SELECT jsonb_agg(v ORDER BY id) FROM voters v)) data";
    const functions =
      "SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1";
    const grants =
      "SELECT c.relname,r.role,priv,has_table_privilege(r.role,c.oid,priv) allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role) CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) priv WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1,2,3";
    const originalPolicies = (await pg.query(policies)).rows;
    const originalRecords = (await pg.query(records)).rows;
    const originalFunctions = (await pg.query<{ signature: string; definition: string }>(functions))
      .rows;
    const originalGrants = (await pg.query(grants)).rows;
    for (const patch of patches)
      await pg.exec(
        readFileSync(
          new URL(`../../supabase/security/${patch}.forward.sql`, import.meta.url),
          "utf8",
        ),
      );
    expect((await pg.query(records)).rows).toEqual(originalRecords);
    for (const patch of [...patches].reverse())
      await pg.exec(
        readFileSync(
          new URL(`../../supabase/security/${patch}.rollback.sql`, import.meta.url),
          "utf8",
        ),
      );
    expect((await pg.query(records)).rows).toEqual(originalRecords);
    expect((await pg.query(policies)).rows).toEqual(originalPolicies);
    expect((await pg.query(grants)).rows).toEqual(originalGrants);
    const restored = (await pg.query<{ signature: string; definition: string }>(functions)).rows;
    for (const original of originalFunctions)
      expect(
        restored.find((f) => f.signature === original.signature)?.definition.replace(/\r\n/g, "\n"),
      ).toEqual(original.definition.replace(/\r\n/g, "\n"));
    expect(
      (
        await pg.query(
          "SELECT has_function_privilege('service_role','public.agent_session_issue(uuid,text,text)','EXECUTE') allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
    expect(
      (
        await pg.query(
          "SELECT has_function_privilege('service_role','public.agent_sms_config(text,integer,jsonb)','EXECUTE') allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  } finally {
    await pg.close();
  }
}, 60000);
