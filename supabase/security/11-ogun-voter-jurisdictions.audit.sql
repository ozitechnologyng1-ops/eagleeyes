-- READ ONLY. Aggregate audit of Ogun mapping; does not return voter personal data.
WITH code_map AS MATERIALIZED (
  SELECT p."puId" AS code,count(*) AS matches,min(p.id) AS pu_id,
    min(p.ward_id) AS ward_id,min(p.localgovernment_id) AS lga_id,
    bool_and(coalesce(w.state_id=27 AND w.localgovernment_id=p.localgovernment_id
      AND l.state_id=27 AND p."puId" ~ '^27-[0-9]{2}-[0-9]{2}-[0-9]{3}$'
      AND (p.pu_code IS NULL OR p.pu_code=p."puId"),false)) AS valid
  FROM public.polling_units p
  LEFT JOIN public.wards w ON w.id=p.ward_id
  LEFT JOIN public.local_governments l ON l.id=p.localgovernment_id
  WHERE p.state_id=27 GROUP BY p."puId"
)
SELECT count(*) AS total_ogun_rows,
  count(*) FILTER(WHERE m.matches=1 AND m.valid) AS safely_mapped_rows,
  count(*) FILTER(WHERE m.matches=1 AND m.valid AND
    ROW(v.localgovernment_id,v.ward_id,v.polling_unit_id)
      IS DISTINCT FROM ROW(m.lga_id,m.ward_id,m.pu_id)) AS needs_correction,
  count(*) FILTER(WHERE m.code IS NULL) AS unmatched_rows,
  count(*) FILTER(WHERE m.matches>1) AS ambiguous_rows,
  count(*) FILTER(WHERE m.matches=1 AND NOT m.valid) AS invalid_parent_rows
FROM public.voters v LEFT JOIN code_map m ON m.code=v.puid WHERE v.state_id=27;
