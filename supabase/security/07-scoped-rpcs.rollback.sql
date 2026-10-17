-- PROPOSED ROLLBACK. Restores captured function bodies and public execution.
BEGIN;

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

GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC,anon,authenticated;
COMMIT;
