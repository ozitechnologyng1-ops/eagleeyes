BEGIN;

CREATE FUNCTION public.election_lga_polling_unit_totals(p_state_id integer, p_lga_id integer)
RETURNS TABLE(id integer, name text, state_id integer, total_pus bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT l.id::integer, l.name::text, l.state_id::integer, count(p.id)
  FROM public.local_governments l
  LEFT JOIN public.polling_units p
    ON p.localgovernment_id = l.id AND p.state_id = l.state_id
  WHERE (p_state_id IS NULL OR l.state_id = p_state_id)
    AND (p_lga_id IS NULL OR l.id = p_lga_id)
  GROUP BY l.id, l.name, l.state_id;
$function$;

REVOKE ALL ON FUNCTION public.election_lga_polling_unit_totals(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.election_lga_polling_unit_totals(integer, integer) TO anon, authenticated;

COMMIT;
