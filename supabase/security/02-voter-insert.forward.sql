-- PROPOSED ONLY. Do not run without explicit production approval.
-- Gate: identify and retest every legitimate voter uploader first.
-- This removes the unconditional permissive INSERT policy, but the remaining
-- voters_insert policy still trusts the spoofable custom-agent header.
BEGIN;

DROP POLICY "Allow uploader insert to voters" ON public.voters;

COMMIT;
