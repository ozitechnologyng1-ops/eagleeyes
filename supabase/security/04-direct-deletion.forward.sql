-- PROPOSED ONLY. Confirm external admin workflows before production approval.
-- No direct agents/voters DELETE call was found in inspected frontend code.
-- Existing RLS delete policies depend on the spoofable x-agent-id header.
-- The 14 non-WhatsApp public tables also grant TRUNCATE to anon/authenticated; list each
-- baseline table explicitly to avoid affecting future tables unexpectedly.
BEGIN;

REVOKE DELETE ON TABLE public.agents, public.voters FROM anon, authenticated;
REVOKE TRUNCATE ON TABLE
  public.agents, public.candles, public.election_results, public.elections,
  public.local_governments, public.party_results, public.polling_units, public.polling_units_lagos,
  public.states, public.treasury_allocations, public.tributes, public.volunteers,
  public.voters, public.wards
FROM anon, authenticated;

COMMIT;
