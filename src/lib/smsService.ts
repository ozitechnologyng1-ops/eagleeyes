import { supabase } from "./supabase";

export interface TwilioStateConfig {
  account_sid: string;
  auth_token: string;
  api_key_sid?: string;
  api_secret?: string;
  from_number: string;
  sms_login_template: string;
  configured?: boolean;
}
export interface SendSmsParams {
  to: string;
  message: string;
  stateId?: number;
  config?: Partial<TwilioStateConfig>;
}
export const DEFAULT_TWILIO_CONFIG: TwilioStateConfig = {
  account_sid: "",
  auth_token: "",
  api_key_sid: "",
  api_secret: "",
  from_number: "EagleEye",
  sms_login_template:
    "Hello {{firstname}}, your EagleEye login credentials: Phone: {{phone}}, Password: {{password}}. Keep this safe.",
};
function safeConfig(value: Partial<TwilioStateConfig> = {}): TwilioStateConfig {
  return {
    ...DEFAULT_TWILIO_CONFIG,
    account_sid: value.account_sid || "",
    api_key_sid: value.api_key_sid || "",
    from_number: value.from_number || DEFAULT_TWILIO_CONFIG.from_number,
    sms_login_template: value.sms_login_template || DEFAULT_TWILIO_CONFIG.sms_login_template,
    configured: value.configured === true,
    auth_token: "",
    api_secret: "",
  };
}
export function getTwilioConfig(stateId = 27): TwilioStateConfig {
  try {
    return safeConfig(
      JSON.parse(localStorage.getItem(`eagleeye_twilio_config_${stateId}`) || "{}"),
    );
  } catch {
    return { ...DEFAULT_TWILIO_CONFIG };
  }
}
async function callSms(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("agent-sms", { body });
  if (error || data?.error)
    throw new Error(
      data?.error || "SMS service unavailable; check your permission and server configuration.",
    );
  if (!data) throw new Error("Invalid SMS response");
  return data;
}
export async function loadTwilioConfig(stateId = 27): Promise<TwilioStateConfig> {
  const data = await callSms({ action: "getConfig", stateId });
  const config = safeConfig(data.config);
  // Show existing locally stored settings only to allow the admin to explicitly save them on the server.
  try {
    const legacy = JSON.parse(localStorage.getItem(`eagleeye_twilio_config_${stateId}`) || "{}");
    if (legacy.auth_token || legacy.api_secret) return { ...config, ...legacy };
  } catch {
    /* Malformed legacy settings are ignored. */
  }
  localStorage.setItem(`eagleeye_twilio_config_${stateId}`, JSON.stringify(config));
  return config;
}
export async function saveTwilioConfig(
  stateId = 27,
  config: Partial<TwilioStateConfig>,
): Promise<TwilioStateConfig> {
  const { configured: _configured, ...values } = config;
  const data = await callSms({ action: "saveConfig", stateId, config: values });
  const saved = safeConfig(data.config);
  localStorage.setItem(`eagleeye_twilio_config_${stateId}`, JSON.stringify(saved));
  return saved;
}
export async function sendTwilioSms({
  to,
  message,
  stateId = 27,
  config,
}: SendSmsParams): Promise<{ success: boolean; messageId?: string }> {
  const data = await callSms({
    action: config ? "test" : "send",
    to,
    message,
    stateId,
    ...(config ? { config } : {}),
  });
  if (data.success !== true) throw new Error("SMS was not sent");
  return { success: true, messageId: data.messageId };
}
export function buildLoginSms(
  template: string,
  vars: { firstname: string; phone: string; password: string },
): string {
  return template
    .replace(/\{\{firstname\}\}/gi, () => vars.firstname || "")
    .replace(/\{\{phone\}\}/gi, () => vars.phone || "")
    .replace(/\{\{password\}\}/gi, () => vars.password || "");
}
