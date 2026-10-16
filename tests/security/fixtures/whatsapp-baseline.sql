CREATE POLICY "conversations_select_policy" ON "public"."whatsapp_conversations" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (agent_id = current_agent_id()) OR (current_agent_role() = ANY (ARRAY['national_admin'::text, 'state_admin'::text])));

CREATE POLICY "conversations_write_policy" ON "public"."whatsapp_conversations" AS PERMISSIVE FOR ALL TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (agent_id = current_agent_id()) OR (current_agent_role() = ANY (ARRAY['national_admin'::text, 'state_admin'::text])));

CREATE POLICY "group_messages_select_policy" ON "public"."whatsapp_group_messages" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR (EXISTS ( SELECT 1
   FROM whatsapp_group_monitors gm
  WHERE ((gm.id = whatsapp_group_messages.monitor_id) AND (gm.state_id = current_agent_state_id())))));

CREATE POLICY "group_messages_write_policy" ON "public"."whatsapp_group_messages" AS PERMISSIVE FOR ALL TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR (EXISTS ( SELECT 1
   FROM whatsapp_group_monitors gm
  WHERE ((gm.id = whatsapp_group_messages.monitor_id) AND (gm.state_id = current_agent_state_id())))));

CREATE POLICY "group_monitors_select_policy" ON "public"."whatsapp_group_monitors" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR (current_agent_state_id() = state_id) OR (added_by_agent_id = current_agent_id()));

CREATE POLICY "group_monitors_write_policy" ON "public"."whatsapp_group_monitors" AS PERMISSIVE FOR ALL TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR ((current_agent_role() = 'state_admin'::text) AND (current_agent_state_id() = state_id)) OR (added_by_agent_id = current_agent_id()));

CREATE POLICY "instances_select_policy" ON "public"."whatsapp_instances" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR ((current_agent_role() = 'state_admin'::text) AND (current_agent_state_id() = state_id)) OR (assigned_agent_id = current_agent_id()) OR ((pool_status = 'standby'::text) AND (current_agent_state_id() = state_id)));

CREATE POLICY "instances_write_policy" ON "public"."whatsapp_instances" AS PERMISSIVE FOR ALL TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR ((current_agent_role() = 'state_admin'::text) AND (current_agent_state_id() = state_id)) OR (assigned_agent_id = current_agent_id()))
WITH CHECK ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR ((current_agent_role() = 'state_admin'::text) AND (current_agent_state_id() = state_id)) OR (assigned_agent_id = current_agent_id()) OR ((assigned_agent_id IS NULL) AND (pool_status = 'standby'::text)));

CREATE POLICY "knowledge_base_select_policy" ON "public"."whatsapp_knowledge_base" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR (current_agent_state_id() = state_id));

CREATE POLICY "knowledge_base_write_policy" ON "public"."whatsapp_knowledge_base" AS PERMISSIVE FOR ALL TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR ((current_agent_role() = 'state_admin'::text) AND (current_agent_state_id() = state_id)));

CREATE POLICY "messages_select_policy" ON "public"."whatsapp_messages" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM whatsapp_conversations c
  WHERE ((c.id = whatsapp_messages.conversation_id) AND ((c.agent_id = current_agent_id()) OR (current_agent_role() = ANY (ARRAY['national_admin'::text, 'state_admin'::text])))))));

CREATE POLICY "messages_write_policy" ON "public"."whatsapp_messages" AS PERMISSIVE FOR ALL TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM whatsapp_conversations c
  WHERE ((c.id = whatsapp_messages.conversation_id) AND ((c.agent_id = current_agent_id()) OR (current_agent_role() = ANY (ARRAY['national_admin'::text, 'state_admin'::text])))))));

CREATE POLICY "outreach_queue_select_policy" ON "public"."whatsapp_outreach_queue" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (agent_id = current_agent_id()) OR (current_agent_role() = ANY (ARRAY['national_admin'::text, 'state_admin'::text])));

CREATE POLICY "outreach_queue_write_policy" ON "public"."whatsapp_outreach_queue" AS PERMISSIVE FOR ALL TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (agent_id = current_agent_id()) OR (current_agent_role() = ANY (ARRAY['national_admin'::text, 'state_admin'::text])));

CREATE POLICY "state_config_select_policy" ON "public"."whatsapp_state_config" AS PERMISSIVE FOR SELECT TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR (current_agent_state_id() = state_id));

CREATE POLICY "state_config_write_policy" ON "public"."whatsapp_state_config" AS PERMISSIVE FOR ALL TO PUBLIC
USING ((auth.role() = 'service_role'::text) OR (current_agent_role() = 'national_admin'::text) OR ((current_agent_role() = 'state_admin'::text) AND (current_agent_state_id() = state_id)));
