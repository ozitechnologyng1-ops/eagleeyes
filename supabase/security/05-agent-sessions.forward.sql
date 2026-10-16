-- PROPOSED ONLY. Requires coordinated frontend/Edge/RLS release and explicit approval.
-- Adds private session metadata; existing agents, passwords and voter records are unchanged.
BEGIN;
CREATE SCHEMA eagle_security AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA eagle_security FROM PUBLIC, anon, authenticated;

CREATE TABLE eagle_security.agent_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  credential_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
ALTER TABLE eagle_security.agent_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX agent_sessions_agent_id_idx ON eagle_security.agent_sessions(agent_id);

CREATE TABLE eagle_security.login_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
ALTER TABLE eagle_security.login_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA eagle_security FROM PUBLIC, anon, authenticated;

CREATE FUNCTION eagle_security.resolve_agent(p_token_hash text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT a.id
  FROM eagle_security.agent_sessions s
  JOIN public.agents a ON a.id = s.agent_id
  WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())
    AND lower(a.status) = 'active'
    AND a.role IN ('national_admin','state_admin','lga_admin','ward_admin','pu_agent')
    AND s.credential_version = encode(sha256(convert_to(a.password_hash, 'UTF8')), 'hex');
$$;
REVOKE ALL ON FUNCTION eagle_security.resolve_agent(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.agent_login_attempt(p_phone_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_window timestamptz := date_bin(interval '15 minutes', now(), timestamptz '2000-01-01');
  v_count integer;
BEGIN
  IF p_phone_hash IS NULL OR p_phone_hash !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  INSERT INTO eagle_security.login_limits AS limits VALUES ('global',v_window,1)
    ON CONFLICT (bucket,window_start) DO UPDATE SET attempts=limits.attempts+1
    RETURNING attempts INTO v_count;
  IF v_count > 1000 THEN RETURN false; END IF;
  INSERT INTO eagle_security.login_limits AS limits VALUES (p_phone_hash,v_window,1)
    ON CONFLICT (bucket,window_start) DO UPDATE SET attempts=limits.attempts+1
    RETURNING attempts INTO v_count;
  RETURN v_count <= 10;
END;
$$;

CREATE FUNCTION public.agent_session_issue(p_agent_id uuid, p_token_hash text, p_credential_version text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_version text; v_expiry timestamptz := NULL;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid session token' USING ERRCODE='22023';
  END IF;
  SELECT encode(sha256(convert_to(a.password_hash,'UTF8')),'hex') INTO v_version
    FROM public.agents a WHERE a.id=p_agent_id AND lower(a.status)='active'
      AND a.password_hash IS NOT NULL AND a.password_hash <> ''
      AND encode(sha256(convert_to(a.password_hash,'UTF8')),'hex') = p_credential_version
      AND a.role IN ('national_admin','state_admin','lga_admin','ward_admin','pu_agent');
  IF v_version IS NULL THEN RAISE EXCEPTION 'Invalid account' USING ERRCODE='28000'; END IF;
  INSERT INTO eagle_security.agent_sessions(token_hash,agent_id,credential_version,expires_at)
    VALUES (p_token_hash,p_agent_id,v_version,v_expiry);
  RETURN v_expiry;
END;
$$;

CREATE FUNCTION public.agent_session_resolve(p_token_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT to_jsonb(a) - 'password_hash' - 'pass' FROM public.agents a
  WHERE a.id=eagle_security.resolve_agent(p_token_hash);
$$;

CREATE FUNCTION public.agent_session_revoke(p_token_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  UPDATE eagle_security.agent_sessions SET revoked_at=now()
  WHERE token_hash=p_token_hash AND revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.agent_login_attempt(text),
  public.agent_session_issue(uuid,text,text), public.agent_session_resolve(text),
  public.agent_session_revoke(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_login_attempt(text),
  public.agent_session_issue(uuid,text,text), public.agent_session_resolve(text),
  public.agent_session_revoke(text) TO service_role;
COMMIT;
