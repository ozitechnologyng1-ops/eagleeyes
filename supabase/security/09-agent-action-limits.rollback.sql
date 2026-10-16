-- Disable the new entrypoint without deleting records or rate-limit metadata.
BEGIN;
REVOKE ALL ON FUNCTION public.agent_action_attempt(text,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
