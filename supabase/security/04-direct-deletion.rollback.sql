-- PROPOSED ROLLBACK ONLY. Restores the exact affected 2026-10-15 table grants.
BEGIN;

GRANT DELETE ON TABLE public.agents, public.voters TO anon, authenticated;
GRANT TRUNCATE ON TABLE
  public.agents, public.candles, public.election_results, public.elections,
  public.local_governments, public.party_results, public.polling_units, public.polling_units_lagos,
  public.states, public.treasury_allocations, public.tributes, public.volunteers,
  public.voters, public.wards
TO anon, authenticated;

COMMIT;
