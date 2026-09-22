import { supabase } from './supabase';

export interface WhatsAppStateConfig {
  id?: string;
  state_id: number;
  green_api_partner_token: string;
  default_flyer_url?: string;
  default_flyer_type: 'image' | 'video';
  default_message_template: string;
  daily_outreach_max: number;
  auto_outreach_enabled: boolean;
  message_interval_minutes: number;
  earning_per_chat: number;
  earning_per_conversion: number;
  earning_per_group_add: number;
  group_ai_response_frequency: number;
  ai_provider: 'gemini' | 'openai' | 'groq';
  ai_model: string;
  ai_api_key?: string;
  group_ai_system_prompt: string;
}

export interface WhatsAppInstance {
  id: string;
  id_instance: number;
  api_token_instance: string;
  api_url: string;
  state_id: number;
  assigned_agent_id?: string;
  instance_type: 'agent' | 'group_monitor';
  pool_status: 'standby' | 'assigned' | 'disconnected' | 'banned';
  wa_state: 'notAuthorized' | 'authorized' | 'blocked' | 'sleepMode' | string;
  phone_number?: string;
  name?: string;
  webhook_type: 'agent' | 'group';
  created_at?: string;
}

export interface KnowledgeEntry {
  id: string;
  state_id: number;
  content_type: string;
  title: string;
  content: string;
  image_url?: string;
  image_caption?: string;
  doc_url?: string;
  doc_name?: string;
  created_at?: string;
}

export interface GroupMonitor {
  id: string;
  state_id: number;
  instance_id?: string;
  group_chat_id: string;
  group_name?: string;
  added_by_agent_id?: string;
  participant_count: number;
  status: string;
  ai_enabled: boolean;
  ai_responses_today: number;
  last_message_at?: string;
  created_at?: string;
  added_by_agent?: {
    id: string;
    name: string;
    phone: string;
  };
}

export interface GroupMessage {
  id: string;
  monitor_id: string;
  group_chat_id: string;
  sender_phone: string;
  sender_name?: string;
  message_type: string;
  message_text: string;
  media_url?: string;
  ai_category: 'positive' | 'negative' | 'neutral' | 'attack' | 'question' | 'information';
  ai_summary?: string;
  ai_responded: boolean;
  ai_response_text?: string;
  timestamp: string;
}

export const greenApiService = {
  // 1. Config Management
  async getConfig(stateId: number): Promise<WhatsAppStateConfig | null> {
    const { data, error } = await supabase
      .from('whatsapp_state_config')
      .select('*')
      .eq('state_id', stateId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async saveConfig(stateId: number, config: Partial<WhatsAppStateConfig>): Promise<WhatsAppStateConfig> {
    const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
      body: { action: 'saveConfig', stateId, config }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data?.data;
  },

  // 2. Instance Pool Operations
  async getInstances(stateId: number): Promise<WhatsAppInstance[]> {
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('state_id', stateId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getPoolStatus(stateId: number) {
    const instances = await this.getInstances(stateId);
    const standby = instances.filter(i => i.pool_status === 'standby' && i.instance_type === 'agent').length;
    const assigned = instances.filter(i => i.pool_status === 'assigned' && i.instance_type === 'agent').length;
    const groupMonitors = instances.filter(i => i.instance_type === 'group_monitor').length;
    return { standby, assigned, groupMonitors, total: instances.length, needsReplenish: standby < 2 };
  },

  async createInstance(stateId: number, type: 'agent' | 'group_monitor' = 'agent', name?: string): Promise<WhatsAppInstance> {
    const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
      body: { action: 'createInstance', stateId, type, name }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.instance;
  },

  async getStandbyInstance(stateId: number): Promise<WhatsAppInstance | null> {
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('state_id', stateId)
      .eq('instance_type', 'agent')
      .eq('pool_status', 'standby')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // 3. Pairing and Authorization
  async getQRCode(instanceId: string): Promise<{ type: string; message: string }> {
    const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
      body: { action: 'getQRCode', instanceId }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.qr;
  },

  async getAuthCode(instanceId: string, phoneNumber: string): Promise<{ status: boolean; code: string }> {
    const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
      body: { action: 'getAuthCode', instanceId, phoneNumber }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.data;
  },

  async checkInstanceState(instanceId: string): Promise<{ waState: string; phoneNumber?: string }> {
    const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
      body: { action: 'checkInstanceState', instanceId }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async assignInstance(instanceId: string, agentId: string) {
    const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
      body: { action: 'assignInstance', instanceId, agentId }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async getAgentInstance(agentId: string): Promise<WhatsAppInstance | null> {
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('assigned_agent_id', agentId)
      .maybeSingle();
    if (error) return null;
    return data;
  },

  async disconnectAgentInstance(instanceId: string): Promise<void> {
    // 1. Invoke Edge function to call Green API GET /logout and reset DB record securely without browser CORS issues
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
        body: { action: 'logoutInstance', instanceId }
      });
      if (!error && data?.success) {
        return;
      }
      if (error) console.warn('Edge function logout error:', error);
    } catch (edgeErr) {
      console.warn('Edge function logout invoke error:', edgeErr);
    }

    // 2. Fallback: Direct Green API GET call + DB update if edge function is unreachable
    const { data: inst } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instanceId)
      .single();

    if (inst && inst.id_instance && inst.api_token_instance) {
      try {
        const baseUrl = (inst.api_url || 'https://api.green-api.com').replace(/\/+$/, '');
        await fetch(`${baseUrl}/waInstance${inst.id_instance}/logout/${inst.api_token_instance}`, {
          method: 'GET'
        });
      } catch (err) {
        console.warn('Green API direct logout error:', err);
      }
    }

    // 3. Clear instance state in DB so it returns to standby / unassigned
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({
        assigned_agent_id: null,
        pool_status: 'standby',
        wa_state: 'notAuthorized',
        phone_number: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', instanceId);

    if (error) throw error;
  },

  // 4. Outreach & Messaging
  async sendFlyer(agentId: string, voterPhone: string, voterName: string, voterId?: number | string, customMessage?: string) {
    const { data, error } = await supabase.functions.invoke('whatsapp-admin', {
      body: { action: 'sendFlyer', agentId, voterPhone, voterName, voterId, customMessage }
    });
    if (error) {
      let serverMsg = error.message;
      try {
        if (error.context && typeof error.context.json === 'function') {
          const errBody = await error.context.json();
          if (errBody?.error) serverMsg = errBody.error;
        }
      } catch (_) {}
      throw new Error(serverMsg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async getAgentConversations(agentId: string) {
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('agent_id', agentId)
      .order('last_message_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getConversationMessages(conversationId: string) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getAgentQueue(agentId: string) {
    const { data, error } = await supabase
      .from('whatsapp_outreach_queue')
      .select('*')
      .eq('agent_id', agentId)
      .order('scheduled_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data || [];
  },

  async setAgentTarget(agentId: string, target: number) {
    const { error } = await supabase
      .from('agents')
      .update({ daily_outreach_target: target })
      .eq('id', agentId);
    if (error) throw error;
  },

  // 5. Candidate Knowledge Base
  async uploadKnowledge(stateId: number, title: string, content: string, contentType = 'policy', imageUrl?: string, imageCaption?: string, docUrl?: string, docName?: string) {
    const { data, error } = await supabase
      .from('whatsapp_knowledge_base')
      .insert({
        state_id: stateId,
        title,
        content,
        content_type: contentType,
        image_url: imageUrl || null,
        image_caption: imageCaption || null,
        doc_url: docUrl || null,
        doc_name: docName || null
      })
      .select()
      .single();

    if (error) {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('whatsapp-admin', {
        body: { action: 'uploadKnowledge', stateId, title, content, contentType, imageUrl, imageCaption, docUrl, docName }
      });
      if (fnErr) throw fnErr;
      if (fnData?.error) throw new Error(fnData.error);
      return fnData.item;
    }
    return data;
  },

  async getKnowledgeEntries(stateId: number): Promise<KnowledgeEntry[]> {
    const { data, error } = await supabase
      .from('whatsapp_knowledge_base')
      .select('id, state_id, content_type, title, content, image_url, image_caption, doc_url, doc_name, created_at')
      .eq('state_id', stateId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deleteKnowledgeEntry(id: string) {
    const { error } = await supabase
      .from('whatsapp_knowledge_base')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // 6. Group Monitors & Intelligence
  async getGroupMonitors(stateId: number): Promise<GroupMonitor[]> {
    const { data, error } = await supabase
      .from('whatsapp_group_monitors')
      .select('*, added_by_agent:agents(id, name, phone)')
      .eq('state_id', stateId)
      .order('last_message_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getGroupMessages(monitorId: string, limit = 50): Promise<GroupMessage[]> {
    const { data, error } = await supabase
      .from('whatsapp_group_messages')
      .select('*')
      .eq('monitor_id', monitorId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async toggleGroupAi(monitorId: string, enabled: boolean) {
    const { error } = await supabase
      .from('whatsapp_group_monitors')
      .update({ ai_enabled: enabled })
      .eq('id', monitorId);
    if (error) {
      const { data, error: fnErr } = await supabase.functions.invoke('whatsapp-admin', {
        body: { action: 'toggleGroupAi', monitorId, enabled }
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
    }
  },

  async bulkToggleGroupAi(stateId: number, enabled: boolean, monitorIds?: string[]) {
    let query = supabase.from('whatsapp_group_monitors').update({ ai_enabled: enabled });
    if (monitorIds && monitorIds.length > 0) {
      query = query.in('id', monitorIds);
    } else if (stateId) {
      query = query.eq('state_id', stateId);
    }
    const { error } = await query;
    if (error) {
      const { data, error: fnErr } = await supabase.functions.invoke('whatsapp-admin', {
        body: { action: 'bulkToggleGroupAi', stateId, enabled, monitorIds }
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
    }
  }
};
