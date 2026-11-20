BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.election_results
  DROP CONSTRAINT IF EXISTS election_results_polling_unit_election_key;

COMMIT;
