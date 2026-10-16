-- PROPOSED ONLY. Roll back the coordinated authorization patch first.
-- Retains private session metadata for investigation; deletes no records.
BEGIN;
REVOKE ALL ON FUNCTION public.agent_login_attempt(text),
  public.agent_session_issue(uuid,text,text), public.agent_session_resolve(text),
  public.agent_session_revoke(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA eagle_security FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
