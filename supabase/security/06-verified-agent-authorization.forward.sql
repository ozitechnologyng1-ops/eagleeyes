-- PROPOSED ONLY. Apply only with the coordinated custom-session application release.
-- Requires 05-agent-sessions.forward.sql. Existing voter and agent records are not rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION public.current_agent_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_token text;
BEGIN
  v_token := NULLIF(current_setting('request.headers',true),'')::jsonb ->> 'x-agent-session';
  IF v_token IS NULL OR v_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  RETURN eagle_security.resolve_agent(encode(sha256(convert_to(v_token,'UTF8')),'hex'));
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_agent_phone()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT phone FROM public.agents WHERE id=public.current_agent_id();
$$;
CREATE OR REPLACE FUNCTION public.current_agent_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT role FROM public.agents WHERE id=public.current_agent_id();
$$;
CREATE OR REPLACE FUNCTION public.current_agent_state_id()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT state_id FROM public.agents WHERE id=public.current_agent_id();
$$;
CREATE OR REPLACE FUNCTION public.get_current_agent_info(
  OUT out_id uuid, OUT out_role text, OUT out_state_id integer,
  OUT out_lga_id integer, OUT out_ward_id integer, OUT out_pu_id integer)
RETURNS record LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT id,role,state_id,local_governments_id,wards_id,polling_units_id
  FROM public.agents WHERE id=public.current_agent_id();
$$;

CREATE FUNCTION public.agent_scope_allows(p_state integer,p_lga integer,p_ward integer,p_pu integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.get_current_agent_info() c WHERE c.out_id IS NOT NULL AND (
      c.out_role='national_admin' OR (
        p_state=c.out_state_id AND c.out_state_id IS NOT NULL AND (
          c.out_role='state_admin' OR (
            p_lga=c.out_lga_id AND c.out_lga_id IS NOT NULL AND (
              c.out_role='lga_admin' OR (
                p_ward=c.out_ward_id AND c.out_ward_id IS NOT NULL AND (
                  c.out_role='ward_admin' OR (c.out_role='pu_agent'
                    AND p_pu=c.out_pu_id AND c.out_pu_id IS NOT NULL)
                )
              )
            )
          )
        )
      )
    )
  );
$$;

CREATE FUNCTION public.agent_can_manage(p_agent_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.agents a WHERE a.id=p_agent_id
    AND public.role_hierarchy_level(public.current_agent_role()) > public.role_hierarchy_level(a.role)
    AND a.role IN ('national_admin','state_admin','lga_admin','ward_admin','pu_agent')
    AND public.agent_scope_allows(a.state_id,a.local_governments_id,a.wards_id,a.polling_units_id));
$$;

REVOKE ALL ON FUNCTION public.agent_scope_allows(integer,integer,integer,integer),
  public.agent_can_manage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_scope_allows(integer,integer,integer,integer),
  public.agent_can_manage(uuid) TO anon, authenticated, service_role;

DROP POLICY agents_select ON public.agents;
CREATE POLICY agents_select ON public.agents FOR SELECT TO anon,authenticated
  USING (id=(SELECT public.current_agent_id()) OR public.agent_can_manage(id));
-- All browser writes go through the bounded, server-authorized agent endpoint.
REVOKE SELECT,INSERT,UPDATE ON public.agents FROM PUBLIC,anon,authenticated;
GRANT SELECT (id,created_at,name,phone,role,status,jurisdiction_type,jurisdiction_id,
  profile_picture_url,bank_name,account_number,first_name,last_name,account_name,state_id,
  local_governments_id,wards_id,polling_units_id,whatsapp_earnings_balance,
  daily_outreach_target,supporting_documents) ON public.agents TO anon,authenticated;

DROP POLICY voters_select ON public.voters;
CREATE POLICY voters_select ON public.voters FOR SELECT TO anon,authenticated
  USING (
    (SELECT public.current_agent_role()) = 'national_admin' OR (
      state_id = (SELECT out_state_id FROM public.get_current_agent_info()) AND (
        (SELECT public.current_agent_role()) = 'state_admin' OR (
          localgovernment_id = (SELECT out_lga_id FROM public.get_current_agent_info()) AND (
            (SELECT public.current_agent_role()) = 'lga_admin' OR (
              ward_id = (SELECT out_ward_id FROM public.get_current_agent_info()) AND (
                (SELECT public.current_agent_role()) = 'ward_admin' OR (
                  (SELECT public.current_agent_role()) = 'pu_agent' AND
                  polling_unit_id = (SELECT out_pu_id FROM public.get_current_agent_info())
                )
              )
            )
          )
        )
      )
    )
  );
DROP POLICY voters_update ON public.voters;
CREATE POLICY voters_update ON public.voters FOR UPDATE TO anon,authenticated
  USING (
    (SELECT public.current_agent_role()) = 'national_admin' OR (
      state_id = (SELECT out_state_id FROM public.get_current_agent_info()) AND (
        (SELECT public.current_agent_role()) = 'state_admin' OR (
          localgovernment_id = (SELECT out_lga_id FROM public.get_current_agent_info()) AND (
            (SELECT public.current_agent_role()) = 'lga_admin' OR (
              ward_id = (SELECT out_ward_id FROM public.get_current_agent_info()) AND (
                (SELECT public.current_agent_role()) = 'ward_admin' OR (
                  (SELECT public.current_agent_role()) = 'pu_agent' AND
                  polling_unit_id = (SELECT out_pu_id FROM public.get_current_agent_info())
                )
              )
            )
          )
        )
      )
    )
  )
  WITH CHECK (
    (SELECT public.current_agent_role()) = 'national_admin' OR (
      state_id = (SELECT out_state_id FROM public.get_current_agent_info()) AND (
        (SELECT public.current_agent_role()) = 'state_admin' OR (
          localgovernment_id = (SELECT out_lga_id FROM public.get_current_agent_info()) AND (
            (SELECT public.current_agent_role()) = 'lga_admin' OR (
              ward_id = (SELECT out_ward_id FROM public.get_current_agent_info()) AND (
                (SELECT public.current_agent_role()) = 'ward_admin' OR (
                  (SELECT public.current_agent_role()) = 'pu_agent' AND
                  polling_unit_id = (SELECT out_pu_id FROM public.get_current_agent_info())
                )
              )
            )
          )
        )
      )
    )
  );
-- Keep voter identity/geography out of the editable canvassing fields.
REVOKE UPDATE ON public.voters FROM PUBLIC,anon,authenticated;
GRANT UPDATE (first_name,last_name,dob,phone_number,status,notes,party,contact_logs)
  ON public.voters TO anon,authenticated;

CREATE FUNCTION public.agent_write_secure(p_token_hash text,p_target_id uuid,p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE caller public.agents; target public.agents; desired public.agents;
  is_new boolean := p_target_id IS NULL; is_self boolean;
  allowed text[] := ARRAY['name','first_name','last_name','phone','profile_picture_url',
    'bank_name','account_name','account_number','role','status','jurisdiction_type',
    'jurisdiction_id','state_id','local_governments_id','wards_id','polling_units_id',
    'password_hash','daily_outreach_target','supporting_documents'];
BEGIN
  IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR octet_length(p_values::text)>4194304
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_values) k WHERE NOT k=ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid agent fields' USING ERRCODE='22023';
  END IF;
  SELECT * INTO caller FROM public.agents WHERE id=eagle_security.resolve_agent(p_token_hash) FOR SHARE;
  IF caller.id IS NULL THEN RAISE EXCEPTION 'Session required' USING ERRCODE='28000'; END IF;
  is_self := caller.id=p_target_id;
  IF is_new THEN
    target := jsonb_populate_record(NULL::public.agents,jsonb_build_object('id',gen_random_uuid(),
      'created_at',now(),'status','Active','daily_outreach_target',10,'whatsapp_earnings_balance',0,
      'supporting_documents','[]'::jsonb));
  ELSE
    SELECT * INTO target FROM public.agents WHERE id=p_target_id FOR UPDATE;
    IF target.id IS NULL THEN RAISE EXCEPTION 'Agent unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  IF is_self AND EXISTS (SELECT 1 FROM jsonb_object_keys(p_values) k WHERE NOT k=ANY(
    ARRAY['name','first_name','last_name','phone','profile_picture_url','bank_name',
      'account_name','account_number','supporting_documents'])) THEN
    RAISE EXCEPTION 'Protected self-update' USING ERRCODE='42501';
  END IF;
  desired := jsonb_populate_record(target,p_values);
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(desired.phone,''),0));
  IF EXISTS (SELECT 1 FROM public.agents WHERE phone=desired.phone AND id<>desired.id) THEN
    RAISE EXCEPTION 'Phone already assigned' USING ERRCODE='23505';
  END IF;
  IF desired.role NOT IN ('national_admin','state_admin','lga_admin','ward_admin','pu_agent')
    OR desired.role IS NULL OR lower(desired.status) NOT IN ('active','suspended','revoked')
    OR desired.status IS NULL OR desired.name IS NULL OR length(trim(desired.name))=0
    OR length(desired.name)>200 OR desired.phone IS NULL OR desired.phone !~ '^\+?[0-9]{7,16}$'
    OR desired.daily_outreach_target NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'Invalid agent values' USING ERRCODE='22023';
  END IF;
  IF (is_new OR p_values ? 'password_hash') AND (
    desired.password_hash IS NULL OR desired.password_hash !~ '^pbkdf2-sha256\$600000\$[a-f0-9]{32}\$[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'Server password required' USING ERRCODE='22023';
  END IF;
  IF NOT COALESCE(is_self,false) THEN
    IF public.role_hierarchy_level(caller.role)<=public.role_hierarchy_level(desired.role)
      OR (NOT is_new AND public.role_hierarchy_level(caller.role)<=public.role_hierarchy_level(target.role)) THEN
      RAISE EXCEPTION 'Insufficient role' USING ERRCODE='42501';
    END IF;
    IF caller.role<>'national_admin' AND (
      caller.state_id IS NULL OR desired.state_id IS DISTINCT FROM caller.state_id
      OR (NOT is_new AND target.state_id IS DISTINCT FROM caller.state_id)
      OR (caller.role IN ('lga_admin','ward_admin','pu_agent') AND (
        caller.local_governments_id IS NULL OR desired.local_governments_id IS DISTINCT FROM caller.local_governments_id
        OR (NOT is_new AND target.local_governments_id IS DISTINCT FROM caller.local_governments_id)))
      OR (caller.role IN ('ward_admin','pu_agent') AND (
        caller.wards_id IS NULL OR desired.wards_id IS DISTINCT FROM caller.wards_id
        OR (NOT is_new AND target.wards_id IS DISTINCT FROM caller.wards_id)))
      OR caller.role='pu_agent') THEN
      RAISE EXCEPTION 'Outside jurisdiction' USING ERRCODE='42501';
    END IF;
    IF desired.state_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.states WHERE id=desired.state_id)
      OR (desired.role IN ('lga_admin','ward_admin','pu_agent') AND desired.local_governments_id IS NULL)
      OR (desired.role IN ('ward_admin','pu_agent') AND desired.wards_id IS NULL)
      OR (desired.role='pu_agent' AND desired.polling_units_id IS NULL)
      OR (desired.local_governments_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.local_governments
        WHERE id=desired.local_governments_id AND state_id=desired.state_id))
      OR (desired.wards_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.wards
        WHERE id=desired.wards_id AND state_id=desired.state_id AND localgovernment_id=desired.local_governments_id))
      OR (desired.polling_units_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.polling_units
        WHERE id=desired.polling_units_id AND state_id=desired.state_id
          AND localgovernment_id=desired.local_governments_id AND ward_id=desired.wards_id)) THEN
      RAISE EXCEPTION 'Invalid jurisdiction' USING ERRCODE='22023';
    END IF;
  END IF;
  IF is_new THEN
    INSERT INTO public.agents SELECT desired.*;
  ELSE
    UPDATE public.agents SET name=desired.name,first_name=desired.first_name,last_name=desired.last_name,
      phone=desired.phone,profile_picture_url=desired.profile_picture_url,bank_name=desired.bank_name,
      account_name=desired.account_name,account_number=desired.account_number,role=desired.role,
      status=desired.status,jurisdiction_type=desired.jurisdiction_type,jurisdiction_id=desired.jurisdiction_id,
      state_id=desired.state_id,local_governments_id=desired.local_governments_id,wards_id=desired.wards_id,
      polling_units_id=desired.polling_units_id,password_hash=desired.password_hash,
      daily_outreach_target=desired.daily_outreach_target,supporting_documents=desired.supporting_documents
    WHERE id=desired.id;
  END IF;
  RETURN to_jsonb(desired)-'password_hash'-'pass';
END;
$$;
REVOKE ALL ON FUNCTION public.agent_write_secure(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_write_secure(text,uuid,jsonb) TO service_role;
COMMIT;
