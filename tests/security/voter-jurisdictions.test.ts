import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

const sql = (name: string) =>
  readFileSync(
    new URL(`../../supabase/security/11-ogun-voter-jurisdictions.${name}.sql`, import.meta.url),
    "utf8",
  );
let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA eagle_security;
    CREATE TABLE local_governments(id integer PRIMARY KEY,state_id integer);
    CREATE TABLE wards(id integer PRIMARY KEY,state_id integer,localgovernment_id integer);
    CREATE TABLE polling_units(id integer PRIMARY KEY,state_id integer,localgovernment_id integer,ward_id integer,"puId" text,pu_code text);
    CREATE TABLE voters(id integer PRIMARY KEY,state_id integer,localgovernment_id integer,ward_id integer,polling_unit_id integer,puid text,first_name text DEFAULT 'Synthetic',phone_number text DEFAULT 'synthetic',image text DEFAULT 'synthetic-image',notes jsonb DEFAULT '[]');
    INSERT INTO local_governments VALUES(11,27),(21,24);
    INSERT INTO wards VALUES(111,27,11),(211,24,21);
    INSERT INTO polling_units VALUES
      (1111,27,11,111,'27-01-01-001','27-01-01-001'),
      (2111,24,21,211,'24-01-01-001','24-01-01-001'),
      (1112,27,11,111,'27-01-02-001','27-01-02-001'),
      (1113,27,11,111,'27-01-02-001','27-01-02-001'),
      (1114,27,21,211,'27-01-03-001','27-01-03-001');
    INSERT INTO voters(id,state_id,localgovernment_id,ward_id,polling_unit_id,puid) VALUES
      (1,27,21,211,2111,'27-01-01-001'),
      (2,27,NULL,NULL,NULL,'27-01-01-001'),
      (3,27,11,111,1111,'27-01-01-001'),
      (4,24,21,211,2111,'24-01-01-001'),
      (5,24,21,211,2111,'27-01-01-001'),
      (6,27,21,211,2111,'27-99-99-999'),
      (7,27,21,211,2111,'27-01-02-001'),
      (8,27,21,211,2111,'27-01-03-001');
  `);
}, 30000);
afterEach(async () => {
  await db.close();
});

describe("proposed Ogun geographic repair", () => {
  it("runs the standalone pilot atomically, caps it at ten rows and supports rollback", async () => {
    await db.exec(`
      INSERT INTO voters(id,state_id,localgovernment_id,ward_id,polling_unit_id,puid)
      SELECT n,27,21,211,2111,'27-01-01-001' FROM generate_series(100,119) n;
    `);
    const before = await db.query("SELECT * FROM voters ORDER BY id");
    await db.exec(sql("pilot10"));
    expect(
      (await db.query("SELECT count(*) AS n FROM eagle_security.ogun_voter_geo_backup")).rows,
    ).toEqual([{ n: 10 }]);
    expect((await db.query(sql("audit"))).rows[0]).toMatchObject({ needs_correction: 12 });
    expect(
      (await db.query("SELECT to_regclass('pg_temp.eagle_ogun_pilot10_batch') AS name")).rows,
    ).toEqual([{ name: null }]);
    await db.exec(sql("rollback"));
    expect((await db.query("SELECT * FROM voters ORDER BY id")).rows).toEqual(before.rows);
  });
  it("cancels the whole standalone pilot on an update failure", async () => {
    await db.exec(`
      CREATE FUNCTION reject_synthetic_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic update failure'; END $$;
      CREATE TRIGGER synthetic_failure BEFORE UPDATE ON voters
      FOR EACH ROW EXECUTE FUNCTION reject_synthetic_update();
    `);
    const before = await db.query("SELECT * FROM voters ORDER BY id");
    await expect(db.exec(sql("pilot10"))).rejects.toThrow("synthetic update failure");
    expect((await db.query("SELECT * FROM voters ORDER BY id")).rows).toEqual(before.rows);
    expect(
      (await db.query("SELECT to_regclass('eagle_security.ogun_voter_geo_backup') AS name")).rows,
    ).toEqual([{ name: null }]);
  });
  it("audits mapping errors without exposing personal fields", async () => {
    expect((await db.query(sql("audit"))).rows).toEqual([
      {
        total_ogun_rows: 6,
        safely_mapped_rows: 3,
        needs_correction: 2,
        unmatched_rows: 1,
        ambiguous_rows: 1,
        invalid_parent_rows: 1,
      },
    ]);
  });
  it("repairs only unique valid Ogun mappings and preserves other states and voter content", async () => {
    const before = await db.query<{ id: number; [column: string]: unknown }>(
      "SELECT * FROM voters ORDER BY id",
    );
    await db.exec(sql("forward"));
    const after = await db.query<{ id: number; [column: string]: unknown }>(
      "SELECT * FROM voters ORDER BY id",
    );
    for (const original of before.rows) {
      expect(after.rows.find((row) => row.id === original.id)).toEqual(
        original.id === 1 || original.id === 2
          ? { ...original, localgovernment_id: 11, ward_id: 111, polling_unit_id: 1111 }
          : original,
      );
    }
    expect(
      (
        await db.query(
          "SELECT id FROM voters WHERE state_id=27 AND localgovernment_id=11 AND ward_id=111 AND polling_unit_id=1111 ORDER BY id",
        )
      ).rows,
    ).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(
      (await db.query("SELECT count(*) AS n FROM eagle_security.ogun_voter_geo_backup")).rows,
    ).toEqual([{ n: 2 }]);
    expect(
      (
        await db.query(
          "SELECT has_table_privilege('anon','eagle_security.ogun_voter_geo_backup','SELECT') AS readable",
        )
      ).rows,
    ).toEqual([{ readable: false }]);
    await db.exec(sql("forward"));
    expect(
      (await db.query("SELECT count(*) AS n FROM eagle_security.ogun_voter_geo_backup")).rows,
    ).toEqual([{ n: 2 }]);
  });
  it("restores exact previous IDs including nulls while preserving later note edits", async () => {
    const before = await db.query(
      "SELECT id,state_id,puid,localgovernment_id,ward_id,polling_unit_id FROM voters ORDER BY id",
    );
    await db.exec(sql("forward"));
    await db.exec(`UPDATE voters SET notes='["Synthetic follow-up"]' WHERE id=1`);
    await db.exec(sql("rollback"));
    expect(
      (
        await db.query(
          "SELECT id,state_id,puid,localgovernment_id,ward_id,polling_unit_id FROM voters ORDER BY id",
        )
      ).rows,
    ).toEqual(before.rows);
    expect((await db.query("SELECT notes FROM voters WHERE id=1")).rows).toEqual([
      { notes: ["Synthetic follow-up"] },
    ]);
    expect(
      (
        await db.query(
          "SELECT count(*) AS n FROM eagle_security.ogun_voter_geo_backup WHERE rolled_back_at IS NOT NULL",
        )
      ).rows,
    ).toEqual([{ n: 2 }]);
  });
  it("does not overwrite later geographic changes during rollback", async () => {
    await db.exec(sql("forward"));
    await db.exec("UPDATE voters SET ward_id=999 WHERE id=1");
    await db.exec(sql("rollback"));
    expect((await db.query("SELECT ward_id FROM voters WHERE id=1")).rows).toEqual([
      { ward_id: 999 },
    ]);
    expect(
      (
        await db.query(
          "SELECT rolled_back_at FROM eagle_security.ogun_voter_geo_backup WHERE voter_id=1",
        )
      ).rows,
    ).toEqual([{ rolled_back_at: null }]);
  });
  it("honors batch limits and advances through remaining repairs", async () => {
    await db.exec("SET eagle.ogun_geo_batch_size='1'");
    await db.exec(sql("forward"));
    expect(
      (
        await db.query(
          "SELECT voter_id FROM eagle_security.ogun_voter_geo_backup ORDER BY voter_id",
        )
      ).rows,
    ).toEqual([{ voter_id: 1 }]);
    await db.exec("SET eagle.ogun_geo_after_id='1'");
    await db.exec(sql("forward"));
    expect(
      (
        await db.query(
          "SELECT voter_id FROM eagle_security.ogun_voter_geo_backup ORDER BY voter_id",
        )
      ).rows,
    ).toEqual([{ voter_id: 1 }, { voter_id: 2 }]);
  });
});
