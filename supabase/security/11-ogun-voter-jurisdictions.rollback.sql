-- PREPARED ONLY. Restores geographic IDs from the repair snapshot in bounded batches.
-- Rows whose geography or puid changed after repair are skipped for manual review.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE batch_size integer := coalesce(nullif(current_setting('eagle.ogun_geo_batch_size',true),''),'10000')::integer;
BEGIN
  IF batch_size NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Batch size must be between 1 and 10000'; END IF;
END $$;

CREATE TEMP TABLE eagle_ogun_geo_rollback ON COMMIT DROP AS
SELECT a.voter_id,a.old_lga_id,a.old_ward_id,a.old_pu_id
FROM eagle_security.ogun_voter_geo_backup a JOIN public.voters v ON v.id=a.voter_id
WHERE a.rolled_back_at IS NULL AND v.state_id=27 AND v.puid=a.puid
  AND ROW(v.localgovernment_id,v.ward_id,v.polling_unit_id)
    IS NOT DISTINCT FROM ROW(a.new_lga_id,a.new_ward_id,a.new_pu_id)
ORDER BY a.voter_id
LIMIT coalesce(nullif(current_setting('eagle.ogun_geo_batch_size',true),''),'10000')::integer
FOR UPDATE OF v,a SKIP LOCKED;

DO $$
DECLARE changed integer;
BEGIN
  WITH updated AS (
    UPDATE public.voters v SET localgovernment_id=b.old_lga_id,
      ward_id=b.old_ward_id,polling_unit_id=b.old_pu_id
    FROM eagle_ogun_geo_rollback b WHERE v.id=b.voter_id RETURNING v.id
  ) SELECT count(*) INTO changed FROM updated;
  IF changed<>(SELECT count(*) FROM eagle_ogun_geo_rollback) THEN
    RAISE EXCEPTION 'Rollback batch changed unexpectedly; transaction rolled back';
  END IF;
  UPDATE eagle_security.ogun_voter_geo_backup a SET rolled_back_at=now()
    FROM eagle_ogun_geo_rollback b WHERE a.voter_id=b.voter_id;
END $$;

SELECT count(*) AS restored_rows FROM eagle_ogun_geo_rollback;
COMMIT;
