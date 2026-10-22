-- Execute this entire DO block as ONE SQL statement.
-- Changes at most 10 Ogun rows and saves original geographic IDs for rollback.
DO $pilot$
DECLARE
  changed integer;
  batch_count integer;
  last_id integer;
BEGIN
  PERFORM set_config('lock_timeout', '2s', true);

  CREATE SCHEMA IF NOT EXISTS eagle_security;
  CREATE TABLE IF NOT EXISTS eagle_security.ogun_voter_geo_backup (
    voter_id integer PRIMARY KEY,
    state_id integer NOT NULL CHECK (state_id = 27),
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
  REVOKE ALL ON eagle_security.ogun_voter_geo_backup
    FROM PUBLIC, anon, authenticated, service_role;

  CREATE TEMP TABLE eagle_ogun_pilot10_map ON COMMIT DROP AS
  SELECT p."puId" AS code, min(p.id) AS pu_id,
    min(p.ward_id) AS ward_id, min(p.localgovernment_id) AS lga_id
  FROM public.polling_units p
  LEFT JOIN public.wards w ON w.id = p.ward_id
  LEFT JOIN public.local_governments l ON l.id = p.localgovernment_id
  WHERE p.state_id = 27
  GROUP BY p."puId"
  HAVING count(*) = 1 AND bool_and(coalesce(
    w.state_id = 27 AND w.localgovernment_id = p.localgovernment_id
    AND l.state_id = 27
    AND p."puId" ~ '^27-[0-9]{2}-[0-9]{2}-[0-9]{3}$'
    AND (p.pu_code IS NULL OR p.pu_code = p."puId"), false));
  CREATE UNIQUE INDEX ON eagle_ogun_pilot10_map(code);

  CREATE TEMP TABLE eagle_ogun_pilot10_batch ON COMMIT DROP AS
  SELECT v.id AS voter_id, v.state_id, v.puid,
    v.localgovernment_id AS old_lga_id, v.ward_id AS old_ward_id,
    v.polling_unit_id AS old_pu_id,
    m.lga_id AS new_lga_id, m.ward_id AS new_ward_id, m.pu_id AS new_pu_id
  FROM public.voters v
  JOIN eagle_ogun_pilot10_map m ON m.code = v.puid
  WHERE v.state_id = 27 AND
    ROW(v.localgovernment_id, v.ward_id, v.polling_unit_id)
      IS DISTINCT FROM ROW(m.lga_id, m.ward_id, m.pu_id)
  ORDER BY v.id
  LIMIT 10
  FOR UPDATE OF v SKIP LOCKED;

  IF EXISTS (
    SELECT 1 FROM eagle_ogun_pilot10_batch b
    JOIN eagle_security.ogun_voter_geo_backup a USING (voter_id)
    WHERE a.rolled_back_at IS NOT NULL OR
      ROW(a.state_id, a.puid, a.old_lga_id, a.old_ward_id, a.old_pu_id,
        a.new_lga_id, a.new_ward_id, a.new_pu_id)
      IS DISTINCT FROM
      ROW(b.state_id, b.puid, b.old_lga_id, b.old_ward_id, b.old_pu_id,
        b.new_lga_id, b.new_ward_id, b.new_pu_id)
  ) THEN
    RAISE EXCEPTION 'Existing rollback snapshot conflicts; stop for review';
  END IF;

  INSERT INTO eagle_security.ogun_voter_geo_backup (
    voter_id, state_id, puid, old_lga_id, old_ward_id, old_pu_id,
    new_lga_id, new_ward_id, new_pu_id)
  SELECT voter_id, state_id, puid, old_lga_id, old_ward_id, old_pu_id,
    new_lga_id, new_ward_id, new_pu_id
  FROM eagle_ogun_pilot10_batch
  ON CONFLICT (voter_id) DO NOTHING;

  WITH updated AS (
    UPDATE public.voters v
    SET localgovernment_id = b.new_lga_id,
      ward_id = b.new_ward_id, polling_unit_id = b.new_pu_id
    FROM eagle_ogun_pilot10_batch b
    WHERE v.id = b.voter_id AND v.state_id = 27 AND v.puid = b.puid
      AND ROW(v.localgovernment_id, v.ward_id, v.polling_unit_id)
        IS NOT DISTINCT FROM ROW(b.old_lga_id, b.old_ward_id, b.old_pu_id)
    RETURNING v.id
  ) SELECT count(*) INTO changed FROM updated;

  SELECT count(*), max(voter_id) INTO batch_count, last_id
  FROM eagle_ogun_pilot10_batch;
  IF changed <> batch_count THEN
    RAISE EXCEPTION 'Unexpected update count; entire pilot cancelled';
  END IF;
  RAISE NOTICE 'Pilot complete: repaired_rows=%, next_after_id=%', changed, last_id;
END
$pilot$;
