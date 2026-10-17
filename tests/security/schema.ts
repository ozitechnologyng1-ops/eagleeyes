export const fixtureSchema = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE SEQUENCE public.voters_id_seq;
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(),
  name text NOT NULL,phone text,role text NOT NULL,status text NOT NULL DEFAULT 'Active',
  jurisdiction_type text,jurisdiction_id text,profile_picture_url text,bank_name text,
  account_number text,first_name text,last_name text,account_name text,state_id integer,
  local_governments_id integer,wards_id integer,polling_units_id integer,password_hash text,
  whatsapp_earnings_balance numeric DEFAULT 0,daily_outreach_target integer DEFAULT 10,
  supporting_documents jsonb DEFAULT '[]',pass text
);
CREATE TABLE public.voters (
  id integer PRIMARY KEY DEFAULT nextval('public.voters_id_seq'),created_at bigint,
  first_name text,last_name text,image text,puid text,dob text,phone_number text,
  state_id integer,status text DEFAULT 'Undecided',notes jsonb DEFAULT '[]',party varchar,
  contact_logs jsonb DEFAULT '[]',localgovernment_id integer,ward_id integer,polling_unit_id integer
);
CREATE TABLE public.states (id integer PRIMARY KEY);
CREATE TABLE public.local_governments (id integer PRIMARY KEY,state_id integer);
CREATE TABLE public.wards (id integer PRIMARY KEY,state_id integer,localgovernment_id integer);
CREATE TABLE public.polling_units (id integer PRIMARY KEY,state_id integer,localgovernment_id integer,ward_id integer);
CREATE DOMAIN public.vector AS text;
CREATE FUNCTION public.match_knowledge_base(integer,public.vector,integer,double precision)
RETURNS integer LANGUAGE sql AS $$ SELECT 0; $$;
CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN END; $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['candles','election_results','elections','party_results',
'polling_units_lagos','treasury_allocations','tributes','volunteers','whatsapp_conversations',
'whatsapp_group_messages','whatsapp_group_monitors','whatsapp_instances','whatsapp_knowledge_base',
'whatsapp_messages','whatsapp_outreach_queue','whatsapp_state_config'] LOOP
  EXECUTE format('CREATE TABLE public.%I (id integer)',t);
END LOOP; END; $$;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voters ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
GRANT ALL ON SEQUENCE public.voters_id_seq TO anon,authenticated,service_role;
INSERT INTO public.states VALUES (24),(27);
INSERT INTO public.local_governments VALUES (241,24),(242,24),(271,27);
INSERT INTO public.wards VALUES (2411,24,241),(2412,24,241),(2711,27,271);
INSERT INTO public.polling_units VALUES (24111,24,241,2411),(24112,24,241,2411),(27111,27,271,2711);
INSERT INTO public.agents (id,name,phone,role,state_id,local_governments_id,wards_id,polling_units_id,password_hash)
VALUES
('00000000-0000-4000-8000-000000000001','Synthetic National','08000000001','national_admin',NULL,NULL,NULL,NULL,repeat('a',64)),
('00000000-0000-4000-8000-000000000002','Synthetic Lagos','08000000002','state_admin',24,NULL,NULL,NULL,repeat('a',64)),
('00000000-0000-4000-8000-000000000003','Synthetic Ogun','08000000003','state_admin',27,NULL,NULL,NULL,repeat('a',64)),
('00000000-0000-4000-8000-000000000004','Synthetic LGA','08000000004','lga_admin',24,241,NULL,NULL,repeat('a',64)),
('00000000-0000-4000-8000-000000000005','Synthetic Ward','08000000005','ward_admin',24,241,2411,NULL,repeat('a',64)),
('00000000-0000-4000-8000-000000000006','Synthetic PU','08000000006','pu_agent',24,241,2411,24111,repeat('a',64));
INSERT INTO public.voters (id,first_name,state_id,localgovernment_id,ward_id,polling_unit_id,puid)
VALUES (1,'Synthetic A',24,241,2411,24111,'TEST-LAGOS-A'),
(2,'Synthetic B',24,241,2411,24112,'TEST-LAGOS-B'),
(3,'Synthetic C',27,271,2711,27111,'TEST-OGUN-A');
`;

export const whatsappSchema = `
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('role'); $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['whatsapp_conversations','whatsapp_group_messages',
'whatsapp_group_monitors','whatsapp_instances','whatsapp_knowledge_base','whatsapp_messages',
'whatsapp_outreach_queue','whatsapp_state_config'] LOOP
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id TYPE uuid USING gen_random_uuid()',t);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
END LOOP; END; $$;
ALTER TABLE public.whatsapp_conversations ADD agent_id uuid,ADD instance_id uuid;
ALTER TABLE public.whatsapp_messages ADD conversation_id uuid;
ALTER TABLE public.whatsapp_group_messages ADD monitor_id uuid;
ALTER TABLE public.whatsapp_knowledge_base ADD state_id integer;
ALTER TABLE public.whatsapp_group_monitors ADD state_id integer,ADD added_by_agent_id uuid,ADD ai_enabled boolean;
ALTER TABLE public.whatsapp_outreach_queue ADD agent_id uuid,ADD voter_id integer,ADD voter_phone text,
  ADD voter_name text,ADD scheduled_at timestamptz,ADD sent_at timestamptz,ADD status text,ADD is_manual boolean;
ALTER TABLE public.whatsapp_instances ADD id_instance bigint,ADD api_token_instance text,ADD api_url text,
  ADD state_id integer,ADD assigned_agent_id uuid,ADD instance_type text,ADD pool_status text,ADD wa_state text,
  ADD phone_number text,ADD name text,ADD webhook_type text,ADD created_at timestamptz,ADD updated_at timestamptz;
ALTER TABLE public.whatsapp_state_config ADD state_id integer,ADD green_api_partner_token text,
  ADD default_flyer_url text,ADD default_flyer_type text,ADD default_message_template text,
  ADD daily_outreach_max integer,ADD auto_outreach_enabled boolean,ADD message_interval_minutes integer,
  ADD earning_per_chat numeric,ADD earning_per_conversion numeric,ADD earning_per_group_add numeric,
  ADD group_ai_response_frequency integer,ADD ai_provider text,ADD ai_model text,ADD ai_api_key text,
  ADD group_ai_system_prompt text,ADD created_at timestamptz,ADD updated_at timestamptz;
`;
