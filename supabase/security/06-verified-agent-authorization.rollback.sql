-- PROPOSED ROLLBACK ONLY. Restores insecure identity; explicit approval required.
-- Roll back 07 and the coordinated frontend first.
BEGIN;

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

DROP POLICY agents_select ON public.agents;
CREATE POLICY "agents_select" ON "public"."agents" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((phone = COALESCE(current_agent_phone(), ''::text)) OR (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = 'state_admin'::text) AND (agents.state_id = caller.out_state_id)) OR ((caller.out_role = 'lga_admin'::text) AND (agents.local_governments_id = caller.out_lga_id)) OR ((caller.out_role = 'ward_admin'::text) AND (agents.wards_id = caller.out_ward_id)) OR ((caller.out_role = 'pu_agent'::text) AND (agents.polling_units_id = caller.out_pu_id)) OR (caller.out_id = agents.id)))));

DROP POLICY voters_select ON public.voters;
CREATE POLICY "voters_select" ON "public"."voters" AS PERMISSIVE FOR SELECT TO PUBLIC
USING (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = ANY (ARRAY['state_admin'::text, 'lga_admin'::text, 'ward_admin'::text, 'pu_agent'::text])) AND (voters.state_id = caller.out_state_id)))));

DROP POLICY voters_update ON public.voters;
CREATE POLICY "voters_update" ON "public"."voters" AS PERMISSIVE FOR UPDATE TO PUBLIC
USING (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = ANY (ARRAY['state_admin'::text, 'lga_admin'::text, 'ward_admin'::text, 'pu_agent'::text])) AND (voters.state_id = caller.out_state_id)))))
WITH CHECK (EXISTS ( SELECT 1
   FROM get_current_agent_info() caller(out_id, out_role, out_state_id, out_lga_id, out_ward_id, out_pu_id)
  WHERE ((caller.out_role = 'national_admin'::text) OR ((caller.out_role = ANY (ARRAY['state_admin'::text, 'lga_admin'::text, 'ward_admin'::text, 'pu_agent'::text])) AND (voters.state_id = caller.out_state_id)))));
REVOKE SELECT (id,created_at,name,phone,role,status,jurisdiction_type,jurisdiction_id,profile_picture_url,bank_name,account_number,first_name,last_name,account_name,state_id,local_governments_id,wards_id,polling_units_id,whatsapp_earnings_balance,daily_outreach_target,supporting_documents) ON public.agents FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.agents TO anon,authenticated;
REVOKE UPDATE (first_name,last_name,dob,phone_number,status,notes,party,contact_logs) ON public.voters FROM anon,authenticated;
GRANT UPDATE ON public.voters TO anon,authenticated;
DROP FUNCTION public.agent_write_secure(text,uuid,jsonb);
DROP FUNCTION public.agent_can_manage(uuid);
DROP FUNCTION public.agent_scope_allows(integer,integer,integer,integer);
COMMIT;
