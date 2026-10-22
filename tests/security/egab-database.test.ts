import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vite-plus/test";

it("keeps SMS metadata service-only and preserves metadata on rollback", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.agents(id uuid PRIMARY KEY); GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;",
    );
    await db.exec(
      readFileSync(
        new URL("../../supabase/security/10-egab-sms.forward.sql", import.meta.url),
        "utf8",
      ),
    );
    const result = await db.query<{ role: string; selectable: boolean; insertable: boolean }>(
      "SELECT r AS role, has_table_privilege(r,'public.agent_sms_submissions','SELECT') AS selectable, has_table_privilege(r,'public.agent_sms_submissions','INSERT') AS insertable FROM unnest(ARRAY['anon','authenticated','service_role']) r",
    );
    expect(result.rows).toEqual([
      { role: "anon", selectable: false, insertable: false },
      { role: "authenticated", selectable: false, insertable: false },
      { role: "service_role", selectable: true, insertable: true },
    ]);
    expect(
      (
        await db.query<{ enabled: boolean }>(
          "SELECT relrowsecurity AS enabled FROM pg_class WHERE oid='public.agent_sms_submissions'::regclass",
        )
      ).rows[0].enabled,
    ).toBe(true);
    await db.exec(
      readFileSync(
        new URL("../../supabase/security/10-egab-sms.rollback.sql", import.meta.url),
        "utf8",
      ),
    );
    expect(
      (
        await db.query<{ present: boolean }>(
          "SELECT to_regclass('public.agent_sms_submissions') IS NOT NULL AS present",
        )
      ).rows[0].present,
    ).toBe(true);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_table_privilege('service_role','public.agent_sms_submissions','INSERT') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  } finally {
    await db.close();
  }
}, 30000);
