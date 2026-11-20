import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vite-plus/test";

it("keeps one result for each polling unit and election until the original is deleted", async () => {
  const sql = await readFile(
    new URL("../../supabase/security/12-election-result-uniqueness.forward.sql", import.meta.url),
    "utf8",
  );
  const db = new PGlite();
  try {
    await db.exec(
      "create table election_results (polling_units_id text not null, election_type text not null, agent_id text not null)",
    );
    await db.exec(sql);
    const submit = (pu: string, election: string, agent: string) =>
      db.query("insert into election_results values ($1, $2, $3)", [pu, election, agent]);
    await submit("115513", "governorship", "original-agent");
    await expect(submit("115513", "governorship", "other-agent")).rejects.toMatchObject({
      code: "23505",
    });
    await expect(submit("115513", "presidential", "original-agent")).resolves.toBeDefined();
    await expect(submit("115514", "governorship", "other-agent")).resolves.toBeDefined();
    await db.query(
      "delete from election_results where polling_units_id = $1 and election_type = $2",
      ["115513", "governorship"],
    );
    await expect(submit("115513", "governorship", "original-agent")).resolves.toBeDefined();
  } finally {
    await db.close();
  }
}, 15_000);
