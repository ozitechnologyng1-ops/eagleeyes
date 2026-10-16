-- PROPOSED ONLY. Do not run without explicit production approval.
-- Captured baseline: both functions are postgres-owned SECURITY DEFINER,
-- with EXECUTE granted to PUBLIC, anon, authenticated, and service_role.
-- voters_id_seq grants UPDATE to anon and authenticated; USAGE is retained.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.wipe_voters_table() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_voters_sequence() FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON SEQUENCE public.voters_id_seq FROM PUBLIC, anon, authenticated;

COMMIT;
