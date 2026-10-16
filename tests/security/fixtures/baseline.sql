-- Synthetic-test schema baseline only; no production records.
CREATE OR REPLACE FUNCTION public.current_agent_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    RETURN NULLIF(current_setting('request.headers', true)::json->>'x-agent-id', '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_agent_phone()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  headers_text TEXT;
BEGIN
  headers_text := current_setting('request.headers', true);
  IF headers_text IS NULL OR headers_text = '' THEN
    RETURN NULL;
  END IF;
  RETURN headers_text::json->>'x-agent-phone';
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_agent_role()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_agent_id UUID;
    v_role TEXT;
BEGIN
    v_agent_id := current_agent_id();
    IF v_agent_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT role INTO v_role FROM public.agents WHERE id = v_agent_id;
    RETURN v_role;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_agent_state_id()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_agent_id UUID;
    v_state_id INT;
BEGIN
    v_agent_id := current_agent_id();
    IF v_agent_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT state_id INTO v_state_id FROM public.agents WHERE id = v_agent_id;
    RETURN v_state_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_canvassed_voters_count(p_state_id integer DEFAULT NULL::integer, p_localgovernment_id integer DEFAULT NULL::integer, p_ward_id integer DEFAULT NULL::integer, p_polling_unit_id integer DEFAULT NULL::integer, p_lga_id integer DEFAULT NULL::integer, p_localgovernment_lagos_id integer DEFAULT NULL::integer, p_ward_lagos_id integer DEFAULT NULL::integer, p_polling_unit_lagos_id integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count bigint;
  v_lga_id integer := COALESCE(p_localgovernment_id, p_lga_id, p_localgovernment_lagos_id);
  v_ward_id integer := COALESCE(p_ward_id, p_ward_lagos_id);
  v_pu_id integer := COALESCE(p_polling_unit_id, p_polling_unit_lagos_id);
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.voters
  WHERE (p_state_id IS NULL OR state_id = p_state_id)
    AND (v_lga_id IS NULL OR localgovernment_id = v_lga_id)
    AND (v_ward_id IS NULL OR ward_id = v_ward_id)
    AND (v_pu_id IS NULL OR polling_unit_id = v_pu_id)
    AND contact_logs IS NOT NULL
    AND jsonb_array_length(contact_logs) > 0;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_canvassed_voters_count(p_state_id integer DEFAULT NULL::integer, p_localgovernment_id integer DEFAULT NULL::integer, p_ward_id integer DEFAULT NULL::integer, p_polling_unit_id integer DEFAULT NULL::integer, p_lga_id integer DEFAULT NULL::integer, p_localgovernment_lagos_id integer DEFAULT NULL::integer, p_ward_lagos_id integer DEFAULT NULL::integer, p_polling_unit_lagos_id integer DEFAULT NULL::integer, p_puid text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count bigint;
  v_lga_id integer := COALESCE(p_localgovernment_id, p_lga_id, p_localgovernment_lagos_id);
  v_ward_id integer := COALESCE(p_ward_id, p_ward_lagos_id);
  v_pu_id integer := COALESCE(p_polling_unit_id, p_polling_unit_lagos_id);
BEGIN
  IF p_puid IS NOT NULL AND p_puid <> '' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.voters
    WHERE puid = p_puid
      AND contact_logs IS NOT NULL
      AND jsonb_array_length(contact_logs) > 0;
    RETURN v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.voters
  WHERE (p_state_id IS NULL OR state_id = p_state_id)
    AND (v_lga_id IS NULL OR localgovernment_id = v_lga_id)
    AND (v_ward_id IS NULL OR ward_id = v_ward_id)
    AND (v_pu_id IS NULL OR polling_unit_id = v_pu_id)
    AND contact_logs IS NOT NULL
    AND jsonb_array_length(contact_logs) > 0;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_agent_info(OUT out_id uuid, OUT out_role text, OUT out_state_id integer, OUT out_lga_id integer, OUT out_ward_id integer, OUT out_pu_id integer)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  SELECT id, role, state_id, local_governments_id, wards_id, polling_units_id
  INTO out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id
  FROM public.agents
  WHERE id = public.current_agent_id();
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_voter_party_counts(p_state_id integer DEFAULT NULL::integer)
 RETURNS TABLE(party character varying, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_state_id IS NOT NULL THEN
    RETURN QUERY 
    SELECT v.party, COUNT(*)
    FROM voters v
    WHERE v.state_id = p_state_id AND v.party IS NOT NULL
    GROUP BY v.party;
  ELSE
    RETURN QUERY 
    SELECT v.party, COUNT(*)
    FROM voters v
    WHERE v.party IS NOT NULL
    GROUP BY v.party;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_voter_status_counts(p_state_id integer DEFAULT NULL::integer, p_localgovernment_id integer DEFAULT NULL::integer, p_ward_id integer DEFAULT NULL::integer, p_polling_unit_id integer DEFAULT NULL::integer, p_lga_id integer DEFAULT NULL::integer, p_localgovernment_lagos_id integer DEFAULT NULL::integer, p_ward_lagos_id integer DEFAULT NULL::integer, p_polling_unit_lagos_id integer DEFAULT NULL::integer)
 RETURNS TABLE(status text, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lga_id integer := COALESCE(p_localgovernment_id, p_lga_id, p_localgovernment_lagos_id);
  v_ward_id integer := COALESCE(p_ward_id, p_ward_lagos_id);
  v_pu_id integer := COALESCE(p_polling_unit_id, p_polling_unit_lagos_id);
BEGIN
  RETURN QUERY
  SELECT v.status, COUNT(*)
  FROM public.voters v
  WHERE (p_state_id IS NULL OR v.state_id = p_state_id)
    AND (v_lga_id IS NULL OR v.localgovernment_id = v_lga_id)
    AND (v_ward_id IS NULL OR v.ward_id = v_ward_id)
    AND (v_pu_id IS NULL OR v.polling_unit_id = v_pu_id)
  GROUP BY v.status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_voter_status_counts(p_state_id integer DEFAULT NULL::integer, p_localgovernment_id integer DEFAULT NULL::integer, p_ward_id integer DEFAULT NULL::integer, p_polling_unit_id integer DEFAULT NULL::integer, p_lga_id integer DEFAULT NULL::integer, p_localgovernment_lagos_id integer DEFAULT NULL::integer, p_ward_lagos_id integer DEFAULT NULL::integer, p_polling_unit_lagos_id integer DEFAULT NULL::integer, p_puid text DEFAULT NULL::text)
 RETURNS TABLE(status text, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lga_id integer := COALESCE(p_localgovernment_id, p_lga_id, p_localgovernment_lagos_id);
  v_ward_id integer := COALESCE(p_ward_id, p_ward_lagos_id);
  v_pu_id integer := COALESCE(p_polling_unit_id, p_polling_unit_lagos_id);
BEGIN
  IF p_puid IS NOT NULL AND p_puid <> '' THEN
    RETURN QUERY
    SELECT v.status, COUNT(*)
    FROM public.voters v
    WHERE v.puid = p_puid
    GROUP BY v.status;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v.status, COUNT(*)
  FROM public.voters v
  WHERE (p_state_id IS NULL OR v.state_id = p_state_id)
    AND (v_lga_id IS NULL OR v.localgovernment_id = v_lga_id)
    AND (v_ward_id IS NULL OR v.ward_id = v_ward_id)
    AND (v_pu_id IS NULL OR v.polling_unit_id = v_pu_id)
  GROUP BY v.status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_voters_count(p_state_id integer DEFAULT NULL::integer, p_localgovernment_id integer DEFAULT NULL::integer, p_ward_id integer DEFAULT NULL::integer, p_polling_unit_id integer DEFAULT NULL::integer, p_lga_id integer DEFAULT NULL::integer, p_localgovernment_lagos_id integer DEFAULT NULL::integer, p_ward_lagos_id integer DEFAULT NULL::integer, p_polling_unit_lagos_id integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count bigint;
  v_lga_id integer := COALESCE(p_localgovernment_id, p_lga_id, p_localgovernment_lagos_id);
  v_ward_id integer := COALESCE(p_ward_id, p_ward_lagos_id);
  v_pu_id integer := COALESCE(p_polling_unit_id, p_polling_unit_lagos_id);
BEGIN
  -- If no filter is applied (national scope), use reltuples for instant return without full table scan
  IF p_state_id IS NULL AND v_lga_id IS NULL AND v_ward_id IS NULL AND v_pu_id IS NULL THEN
    SELECT COALESCE(reltuples::bigint, 0) INTO v_count FROM pg_class WHERE relname = 'voters';
    IF v_count > 0 THEN
      RETURN v_count;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.voters
  WHERE (p_state_id IS NULL OR state_id = p_state_id)
    AND (v_lga_id IS NULL OR localgovernment_id = v_lga_id)
    AND (v_ward_id IS NULL OR ward_id = v_ward_id)
    AND (v_pu_id IS NULL OR polling_unit_id = v_pu_id);
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_voters_count(p_state_id integer DEFAULT NULL::integer, p_localgovernment_id integer DEFAULT NULL::integer, p_ward_id integer DEFAULT NULL::integer, p_polling_unit_id integer DEFAULT NULL::integer, p_lga_id integer DEFAULT NULL::integer, p_localgovernment_lagos_id integer DEFAULT NULL::integer, p_ward_lagos_id integer DEFAULT NULL::integer, p_polling_unit_lagos_id integer DEFAULT NULL::integer, p_puid text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count bigint;
  v_lga_id integer := COALESCE(p_localgovernment_id, p_lga_id, p_localgovernment_lagos_id);
  v_ward_id integer := COALESCE(p_ward_id, p_ward_lagos_id);
  v_pu_id integer := COALESCE(p_polling_unit_id, p_polling_unit_lagos_id);
BEGIN
  -- If p_puid is provided, query directly by puid for instant indexed lookup
  IF p_puid IS NOT NULL AND p_puid <> '' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.voters
    WHERE puid = p_puid;
    RETURN v_count;
  END IF;

  -- If no filter is applied (national scope), use reltuples for instant return without full table scan
  IF p_state_id IS NULL AND v_lga_id IS NULL AND v_ward_id IS NULL AND v_pu_id IS NULL THEN
    SELECT COALESCE(reltuples::bigint, 0) INTO v_count FROM pg_class WHERE relname = 'voters';
    IF v_count > 0 THEN
      RETURN v_count;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.voters
  WHERE (p_state_id IS NULL OR state_id = p_state_id)
    AND (v_lga_id IS NULL OR localgovernment_id = v_lga_id)
    AND (v_ward_id IS NULL OR ward_id = v_ward_id)
    AND (v_pu_id IS NULL OR polling_unit_id = v_pu_id);
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_voters_sequence()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  ALTER SEQUENCE IF EXISTS voters_id_seq RESTART WITH 1;
  -- Also reset via setval in case the sequence name differs
  PERFORM setval('voters_id_seq', 1, false);
EXCEPTION WHEN OTHERS THEN
  NULL; -- best-effort, non-fatal
END;
$function$;

CREATE OR REPLACE FUNCTION public.role_hierarchy_level(r text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE r
    WHEN 'national_admin' THEN 4
    WHEN 'state_admin' THEN 3
    WHEN 'lga_admin' THEN 2
    WHEN 'ward_admin' THEN 1
    WHEN 'pu_agent' THEN 0
    ELSE -1
  END;
$function$;

CREATE OR REPLACE FUNCTION public.wipe_voters_table()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  deleted_count INTEGER;
BEGIN
  SELECT count(*) INTO deleted_count FROM public.voters;
  TRUNCATE TABLE public.voters RESTART IDENTITY;
  RETURN json_build_object('deleted', deleted_count, 'status', 'ok');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM, 'status', 'error');
END;
$function$;
CREATE POLICY "agents_delete" ON "public"."agents" AS PERMISSIVE FOR DELETE TO PUBLIC
USING (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((role_hierarchy_level(caller.out_role) > role_hierarchy_level(agents.role)) AND ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = 'state_admin'::text) AND (agents.state_id = caller.out_state_id)) OR ((caller.out_role = 'lga_admin'::text) AND (agents.local_governments_id = caller.out_lga_id)) OR ((caller.out_role = 'ward_admin'::text) AND (agents.wards_id = caller.out_ward_id))))));

CREATE POLICY "agents_insert" ON "public"."agents" AS PERMISSIVE FOR INSERT TO PUBLIC
WITH CHECK (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((role_hierarchy_level(caller.out_role) > role_hierarchy_level(agents.role)) AND ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = 'state_admin'::text) AND (agents.state_id = caller.out_state_id)) OR ((caller.out_role = 'lga_admin'::text) AND (agents.local_governments_id = caller.out_lga_id)) OR ((caller.out_role = 'ward_admin'::text) AND (agents.wards_id = caller.out_ward_id))))));

CREATE POLICY "agents_select" ON "public"."agents" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((phone = COALESCE(current_agent_phone(), ''::text)) OR (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = 'state_admin'::text) AND (agents.state_id = caller.out_state_id)) OR ((caller.out_role = 'lga_admin'::text) AND (agents.local_governments_id = caller.out_lga_id)) OR ((caller.out_role = 'ward_admin'::text) AND (agents.wards_id = caller.out_ward_id)) OR ((caller.out_role = 'pu_agent'::text) AND (agents.polling_units_id = caller.out_pu_id)) OR (caller.out_id = agents.id)))));

CREATE POLICY "agents_update" ON "public"."agents" AS PERMISSIVE FOR UPDATE TO PUBLIC
USING (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((caller.out_id = agents.id) OR ((role_hierarchy_level(caller.out_role) > role_hierarchy_level(agents.role)) AND ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = 'state_admin'::text) AND (agents.state_id = caller.out_state_id)) OR ((caller.out_role = 'lga_admin'::text) AND (agents.local_governments_id = caller.out_lga_id)) OR ((caller.out_role = 'ward_admin'::text) AND (agents.wards_id = caller.out_ward_id)))))));

CREATE POLICY "Allow uploader insert to voters" ON "public"."voters" AS PERMISSIVE FOR INSERT TO PUBLIC
WITH CHECK (true);

CREATE POLICY "voters_delete" ON "public"."voters" AS PERMISSIVE FOR DELETE TO PUBLIC
USING (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE (caller.out_role = 'national_admin'::text)));

CREATE POLICY "voters_insert" ON "public"."voters" AS PERMISSIVE FOR INSERT TO PUBLIC
WITH CHECK (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE (caller.out_role = 'national_admin'::text)));

CREATE POLICY "voters_select" ON "public"."voters" AS PERMISSIVE FOR SELECT TO PUBLIC
USING (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = ANY (ARRAY['state_admin'::text, 'lga_admin'::text, 'ward_admin'::text, 'pu_agent'::text])) AND (voters.state_id = caller.out_state_id)))));

CREATE POLICY "voters_update" ON "public"."voters" AS PERMISSIVE FOR UPDATE TO PUBLIC
USING (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = ANY (ARRAY['state_admin'::text, 'lga_admin'::text, 'ward_admin'::text, 'pu_agent'::text])) AND (voters.state_id = caller.out_state_id)))))
WITH CHECK (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = ANY (ARRAY['state_admin'::text, 'lga_admin'::text, 'ward_admin'::text, 'pu_agent'::text])) AND (voters.state_id = caller.out_state_id)))));
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated,service_role;
