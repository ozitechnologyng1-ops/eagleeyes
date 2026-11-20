BEGIN;
SET LOCAL lock_timeout = '3s';

-- PostgreSQL rejects this change if duplicate rows already exist.
ALTER TABLE public.election_results
  ADD CONSTRAINT election_results_polling_unit_election_key
  UNIQUE (polling_units_id, election_type);

COMMIT;
