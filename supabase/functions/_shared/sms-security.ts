export interface SmsConfig {
  account_sid?: string;
  auth_token?: string;
  api_key_sid?: string;
  api_secret?: string;
  from_number?: string;
  sms_login_template?: string;
}
export function normalizePhone(value: unknown): string {
  if (typeof value !== "string" || !/^\+?[0-9]{7,16}$/.test(value))
    throw new Error("Invalid phone number");
  let phone = value;
  if (phone.startsWith("0")) phone = "+234" + phone.slice(1);
  else if (!phone.startsWith("+")) phone = "+" + phone;
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) throw new Error("Invalid phone number");
  return phone;
}
export function validateSmsConfig(value: unknown): SmsConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid SMS configuration");
  const result: SmsConfig = {};
  const allowed = [
    "account_sid",
    "auth_token",
    "api_key_sid",
    "api_secret",
    "from_number",
    "sms_login_template",
  ];
  for (const [key, raw] of Object.entries(value)) {
    if (
      !allowed.includes(key) ||
      typeof raw !== "string" ||
      raw.length > (key === "sms_login_template" ? 2000 : 128)
    )
      throw new Error("Invalid SMS configuration");
    const text = raw.trim();
    if (!text) continue;
    if (key === "account_sid" && !/^AC[0-9a-f]{32}$/i.test(text))
      throw new Error("Invalid account SID");
    if (key === "api_key_sid" && !/^SK[0-9a-f]{32}$/i.test(text))
      throw new Error("Invalid API key SID");
    if (
      key === "from_number" &&
      !/^(?:[A-Za-z][A-Za-z0-9 ]{0,10}|\+[1-9][0-9]{6,14}|MG[0-9a-f]{32})$/.test(text)
    )
      throw new Error("Invalid sender");
    result[key as keyof SmsConfig] = text;
  }
  return result;
}
export function publicSmsConfig(config: SmsConfig) {
  return {
    account_sid: config.account_sid || "",
    api_key_sid: config.api_key_sid || "",
    from_number: config.from_number || "EagleEye",
    sms_login_template: config.sms_login_template || "",
    auth_token: "",
    api_secret: "",
    configured: !!(
      config.account_sid &&
      (config.auth_token || (config.api_key_sid && config.api_secret))
    ),
  };
}
