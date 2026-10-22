-- PREPARED ONLY. Requires explicit approval before production use.
-- One batch per transaction. Does not change RLS, agents, voter identity or content.
-- Optional session settings: eagle.ogun_geo_batch_size (1..10000),
-- eagle.ogun_geo_after_id (default 0; advance to returned next_after_id).
-- For the standalone 10-row pilot, use the separate pilot10.sql file.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS eagle_security.ogun_voter_geo_backup (
  voter_id integer PRIMARY KEY,
  state_id integer NOT NULL CHECK (state_id=27),
  puid text NOT NULL,
  old_lga_id integer,
  old_ward_id integer,
  old_pu_id integer,
  new_lga_id integer NOT NULL,
  new_ward_id integer NOT NULL,
  new_pu_id integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz
);
ALTER TABLE eagle_security.ogun_voter_geo_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eagle_security.ogun_voter_geo_backup FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE batch_size integer := coalesce(nullif(current_setting('eagle.ogun_geo_batch_size',true),''),'10000')::integer;
BEGIN
  IF batch_size NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Batch size must be between 1 and 10000'; END IF;
END $$;

CREATE TEMP TABLE eagle_ogun_geo_map ON COMMIT DROP AS
WITH codes AS (
  SELECT p."puId" AS code,count(*) AS matches,min(p.id) AS pu_id,
    min(p.ward_id) AS ward_id,min(p.localgovernment_id) AS lga_id,
    bool_and(coalesce(w.state_id=27 AND w.localgovernment_id=p.localgovernment_id
      AND l.state_id=27 AND p."puId" ~ '^27-[0-9]{2}-[0-9]{2}-[0-9]{3}$'
      AND (p.pu_code IS NULL OR p.pu_code=p."puId"),false)) AS valid
  FROM public.polling_units p
  LEFT JOIN public.wards w ON w.id=p.ward_id
  LEFT JOIN public.local_governments l ON l.id=p.localgovernment_id
  WHERE p.state_id=27 GROUP BY p."puId"
)
SELECT code,pu_id,ward_id,lga_id FROM codes WHERE matches=1 AND valid;
CREATE UNIQUE INDEX ON eagle_ogun_geo_map(code);

CREATE TEMP TABLE eagle_ogun_geo_batch ON COMMIT DROP AS
SELECT v.id AS voter_id,v.state_id,v.puid,
  v.localgovernment_id AS old_lga_id,v.ward_id AS old_ward_id,v.polling_unit_id AS old_pu_id,
  m.lga_id AS new_lga_id,m.ward_id AS new_ward_id,m.pu_id AS new_pu_id
FROM public.voters v JOIN eagle_ogun_geo_map m ON m.code=v.puid
WHERE v.state_id=27
  AND v.id>coalesce(nullif(current_setting('eagle.ogun_geo_after_id',true),''),'0')::integer
  AND ROW(v.localgovernment_id,v.ward_id,v.polling_unit_id)
    IS DISTINCT FROM ROW(m.lga_id,m.ward_id,m.pu_id)
ORDER BY v.id
LIMIT coalesce(nullif(current_setting('eagle.ogun_geo_batch_size',true),''),'10000')::integer
FOR UPDATE OF v SKIP LOCKED;

DO $$
DECLARE changed integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM eagle_ogun_geo_batch b
    JOIN eagle_security.ogun_voter_geo_backup a USING(voter_id)
    WHERE a.rolled_back_at IS NOT NULL OR
      ROW(a.state_id,a.puid,a.old_lga_id,a.old_ward_id,a.old_pu_id,a.new_lga_id,a.new_ward_id,a.new_pu_id)
      IS DISTINCT FROM ROW(b.state_id,b.puid,b.old_lga_id,b.old_ward_id,b.old_pu_id,b.new_lga_id,b.new_ward_id,b.new_pu_id)
  ) THEN RAISE EXCEPTION 'Existing geographic snapshot conflicts; stop for review'; END IF;

  INSERT INTO eagle_security.ogun_voter_geo_backup
    (voter_id,state_id,puid,old_lga_id,old_ward_id,old_pu_id,new_lga_id,new_ward_id,new_pu_id)
  SELECT voter_id,state_id,puid,old_lga_id,old_ward_id,old_pu_id,new_lga_id,new_ward_id,new_pu_id
  FROM eagle_ogun_geo_batch ON CONFLICT(voter_id) DO NOTHING;

  WITH updated AS (
    UPDATE public.voters v SET localgovernment_id=b.new_lga_id,
      ward_id=b.new_ward_id,polling_unit_id=b.new_pu_id
    FROM eagle_ogun_geo_batch b WHERE v.id=b.voter_id AND v.state_id=27 AND v.puid=b.puid
      AND ROW(v.localgovernment_id,v.ward_id,v.polling_unit_id)
        IS NOT DISTINCT FROM ROW(b.old_lga_id,b.old_ward_id,b.old_pu_id)
    RETURNING v.id
  ) SELECT count(*) INTO changed FROM updated;
  IF changed<>(SELECT count(*) FROM eagle_ogun_geo_batch) THEN
    RAISE EXCEPTION 'Batch changed unexpectedly; transaction rolled back';
  END IF;
END $$;

SELECT count(*) AS repaired_rows,max(voter_id) AS next_after_id FROM eagle_ogun_geo_batch;
COMMIT;
