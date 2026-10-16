-- PROPOSED ONLY. Adds private configuration and service-only, session-verified operations.
BEGIN;
CREATE TABLE eagle_security.sms_config (
  state_id integer PRIMARY KEY REFERENCES public.states(id),
  config jsonb NOT NULL CHECK (jsonb_typeof(config)='object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE eagle_security.sms_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eagle_security.sms_config FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.agent_action_attempt(p_token_hash text,p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid:=eagle_security.resolve_agent(p_token_hash); v_count integer; v_limit integer;
  v_window timestamptz:=date_bin(interval '1 minute',now(),timestamptz '2000-01-01');
BEGIN
  IF caller IS NULL THEN RETURN false; END IF;
  v_limit:=CASE p_action WHEN 'agent-sms' THEN 20 WHEN 'agent-admin' THEN 10
    WHEN 'analyze-result' THEN 10 WHEN 'paystack' THEN 60 ELSE 0 END;
  IF v_limit=0 THEN RETURN false; END IF;
  INSERT INTO eagle_security.login_limits AS limits VALUES (p_action||':'||caller::text,v_window,1)
    ON CONFLICT (bucket,window_start) DO UPDATE SET attempts=limits.attempts+1
    RETURNING attempts INTO v_count;
  RETURN v_count<=v_limit;
END; $$;

CREATE FUNCTION public.agent_sms_config(p_token_hash text,p_state_id integer,p_values jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller public.agents; saved jsonb;
BEGIN
  SELECT * INTO caller FROM public.agents WHERE id=eagle_security.resolve_agent(p_token_hash);
  IF caller.id IS NULL OR NOT (caller.role='national_admin' OR
    (caller.role='state_admin' AND caller.state_id=p_state_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_values IS NOT NULL THEN
    IF jsonb_typeof(p_values)<>'object' OR octet_length(p_values::text)>8192
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_values) k WHERE NOT k=ANY(
        ARRAY['account_sid','auth_token','api_key_sid','api_secret','from_number','sms_login_template'])) THEN
      RAISE EXCEPTION 'Invalid configuration' USING ERRCODE='22023';
    END IF;
    INSERT INTO eagle_security.sms_config(state_id,config) VALUES (p_state_id,p_values)
      ON CONFLICT(state_id) DO UPDATE SET config=eagle_security.sms_config.config||EXCLUDED.config,updated_at=now();
  END IF;
  SELECT config INTO saved FROM eagle_security.sms_config WHERE state_id=p_state_id;
  RETURN saved;
END; $$;

-- Only the verified send endpoint consumes secret values; the browser receives a redacted projection.
CREATE FUNCTION public.agent_sms_delivery_config(p_token_hash text,p_state_id integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT s.config FROM eagle_security.sms_config s JOIN public.agents a
    ON a.id=eagle_security.resolve_agent(p_token_hash)
  WHERE s.state_id=p_state_id AND (a.role='national_admin' OR
    (a.state_id=p_state_id AND a.role IN ('state_admin','lga_admin','ward_admin')));
$$;

REVOKE ALL ON FUNCTION public.agent_action_attempt(text,text),public.agent_sms_config(text,integer,jsonb),
  public.agent_sms_delivery_config(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_action_attempt(text,text),public.agent_sms_config(text,integer,jsonb),
  public.agent_sms_delivery_config(text,integer) TO service_role;
COMMIT;
