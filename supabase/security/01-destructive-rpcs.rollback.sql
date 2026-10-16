-- PROPOSED ROLLBACK ONLY. Restores the exact affected EXECUTE/UPDATE grants
-- recorded on 2026-10-15; does not invoke either function or alter any rows.
BEGIN;

GRANT EXECUTE ON FUNCTION public.wipe_voters_table() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_voters_sequence() TO PUBLIC, anon, authenticated;
GRANT UPDATE ON SEQUENCE public.voters_id_seq TO anon, authenticated;

COMMIT;
