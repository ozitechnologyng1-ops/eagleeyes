export interface TwilioStateConfig {
  account_sid: string;
  auth_token: string;
  api_key_sid?: string;
  api_secret?: string;
  from_number: string;
  sms_login_template: string;
}

export interface SendSmsParams {
  to: string;
  message: string;
  stateId?: number;
  config?: Partial<TwilioStateConfig>;
}

export const DEFAULT_TWILIO_CONFIG: TwilioStateConfig = {
  account_sid: import.meta.env.VITE_TWILIO_ACCOUNT_SID || '',
  auth_token: import.meta.env.VITE_TWILIO_AUTH_TOKEN || '',
  api_key_sid: import.meta.env.VITE_TWILIO_API_KEY_SID || '',
  api_secret: import.meta.env.VITE_TWILIO_API_SECRET || '',
  from_number: 'EagleEye',
  sms_login_template: 'Hello {{firstname}}, your EagleEye login credentials: Phone: {{phone}}, Password: {{password}}. Keep this safe.',
};

/** Get Twilio configuration for a specific state */
export function getTwilioConfig(stateId: number = 27): TwilioStateConfig {
  try {
    const raw = localStorage.getItem(`eagleeye_twilio_config_${stateId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_TWILIO_CONFIG,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn('Failed to read Twilio config from localStorage:', e);
  }
  return { ...DEFAULT_TWILIO_CONFIG };
}

/** Save Twilio configuration for a specific state */
export function saveTwilioConfig(stateId: number = 27, config: Partial<TwilioStateConfig>): TwilioStateConfig {
  const current = getTwilioConfig(stateId);
  const updated: TwilioStateConfig = {
    ...current,
    ...config,
  };
  try {
    localStorage.setItem(`eagleeye_twilio_config_${stateId}`, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save Twilio config to localStorage:', e);
  }
  return updated;
}

/** Send SMS via the Twilio serverless relay */
export async function sendTwilioSms({ to, message, stateId = 27, config }: SendSmsParams): Promise<{ success: boolean; messageId?: string }> {
  const activeConfig = config ? { ...getTwilioConfig(stateId), ...config } : getTwilioConfig(stateId);

  const res = await fetch('/api/send-sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      message,
      accountSid: activeConfig.account_sid,
      authToken: activeConfig.auth_token,
      apiKeySid: activeConfig.api_key_sid,
      apiSecret: activeConfig.api_secret,
      fromNumber: activeConfig.from_number,
    }),
  });

  const data = await res.json().catch(() => ({}));

  console.log('[Twilio API Response Status]:', res.status, res.statusText);
  console.log('[Twilio Full Response Body]:', data);

  if (!res.ok || !data.success) {
    console.error('[Twilio SMS Error]:', {
      error: data.error,
      code: data.code,
      moreInfo: data.moreInfo,
      raw: data.twilioRaw
    });
    const errorMsg = data.error || (data.code ? `Twilio Error (${data.code})` : `Failed to send SMS (HTTP ${res.status})`);
    throw new Error(errorMsg);
  }

  return { success: true, messageId: data.messageId };
}

/** Interpolate template variables: {{firstname}}, {{phone}}, {{password}} */
export function buildLoginSms(
  template: string,
  vars: { firstname: string; phone: string; password: string }
): string {
  return template
    .replace(/\{\{firstname\}\}/gi, vars.firstname || '')
    .replace(/\{\{phone\}\}/gi, vars.phone || '')
    .replace(/\{\{password\}\}/gi, vars.password || '');
}
