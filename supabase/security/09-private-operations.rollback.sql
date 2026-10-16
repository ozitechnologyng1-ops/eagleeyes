-- PROPOSED ONLY. Disable new entrypoints; preserve private configuration and all records.
BEGIN;
REVOKE ALL ON FUNCTION public.agent_action_attempt(text,text),public.agent_sms_config(text,integer,jsonb),
  public.agent_sms_delivery_config(text,integer)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
