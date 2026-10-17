-- PROPOSED ROLLBACK ONLY. Restores the 2026-10-15 unconditional policy.
BEGIN;

CREATE POLICY "Allow uploader insert to voters"
ON public.voters AS PERMISSIVE FOR INSERT TO PUBLIC
WITH CHECK (true);

COMMIT;
