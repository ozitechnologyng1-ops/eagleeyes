import { supabase } from './supabase';

export interface SmsStateConfig {
  sms_api_key: string;
  sms_sender_id: string;
  sms_channel: 'dnd' | 'generic' | 'whatsapp' | 'voice';
  sms_login_template: string;
}

export interface SendSmsParams {
  to: string;
  message: string;
  apiKey: string;
  senderId: string;
  channel: string;
}

const TERMII_BASE = 'https://v3.api.termii.com';

export async function sendSms({ to, message, apiKey, senderId, channel }: SendSmsParams): Promise<void> {
  // Normalise Nigerian number to international format
  let phone = to.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '234' + phone.slice(1);
  if (!phone.startsWith('234')) phone = '234' + phone;

  const res = await fetch(`${TERMII_BASE}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      to: phone,
      from: senderId,
      sms: message,
      type: 'plain',
      channel,
    }),
  });

  const json = await res.json();
  if (!res.ok || (json.code && json.code !== 'ok')) {
    throw new Error(json.message || `SMS send failed (HTTP ${res.status})`);
  }
}

/** Interpolate template variables: {{firstname}}, {{phone}}, {{password}} */
export function buildLoginSms(
  template: string,
  vars: { firstname: string; phone: string; password: string }
): string {
  return template
    .replace(/\{\{firstname\}\}/gi, vars.firstname)
    .replace(/\{\{phone\}\}/gi, vars.phone)
    .replace(/\{\{password\}\}/gi, vars.password);
}

/** Fetch SMS config for a given state from whatsapp_state_config */
export async function getSmsConfig(stateId: number): Promise<SmsStateConfig | null> {
  const { data, error } = await supabase
    .from('whatsapp_state_config')
    .select('sms_api_key, sms_sender_id, sms_channel, sms_login_template')
    .eq('state_id', stateId)
    .maybeSingle();

  if (error) throw error;
  return data as SmsStateConfig | null;
}

/** Upsert SMS config fields directly into whatsapp_state_config */
export async function saveSmsConfig(stateId: number, cfg: Partial<SmsStateConfig>): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_state_config')
    .upsert({ state_id: stateId, ...cfg }, { onConflict: 'state_id' });
  if (error) throw error;
}
