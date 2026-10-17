-- PROPOSED ONLY. Service-only rate limits for verified non-messaging operations.
BEGIN;
CREATE FUNCTION public.agent_action_attempt(p_token_hash text,p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid:=eagle_security.resolve_agent(p_token_hash); v_count integer; v_limit integer;
  v_window timestamptz:=date_bin(interval '1 minute',now(),timestamptz '2000-01-01');
BEGIN
  IF caller IS NULL THEN RETURN false; END IF;
  v_limit:=CASE p_action WHEN 'agent-admin' THEN 10
    WHEN 'analyze-result' THEN 10 WHEN 'paystack' THEN 60 ELSE 0 END;
  IF v_limit=0 THEN RETURN false; END IF;
  INSERT INTO eagle_security.login_limits AS limits VALUES (p_action||':'||caller::text,v_window,1)
    ON CONFLICT (bucket,window_start) DO UPDATE SET attempts=limits.attempts+1
    RETURNING attempts INTO v_count;
  RETURN v_count<=v_limit;
END; $$;

REVOKE ALL ON FUNCTION public.agent_action_attempt(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_action_attempt(text,text) TO service_role;
COMMIT;
