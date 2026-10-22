-- First restore the prior Edge Functions/frontend. Retain SMS tracking for reconciliation.
BEGIN;
REVOKE ALL ON public.agent_sms_submissions FROM service_role;
COMMIT;
