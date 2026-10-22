-- Prepared only; apply before deploying agent-sms and the updated agent-admin.
BEGIN;
CREATE TABLE public.agent_sms_submissions (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.agents(id),
  agent_id uuid REFERENCES public.agents(id),
  body_hash text NOT NULL CHECK (body_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL,
  reference text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_sms_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_sms_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_sms_submissions TO service_role;
COMMIT;
