import { bodyDigest, egabConfig, normalizeNigerianPhone, signEgab } from "./egab.ts";
import type { SmsStore } from "./agent-sms.ts";

export const smsUuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export type BrowserSmsRequest = {
  id: string;
  url: string;
  method: "POST";
  body: string;
  headers: Record<string, string>;
};

// Call only after authorizing the recipient and message at the endpoint.
export async function prepareBrowserSms(
  store: SmsStore,
  env: (key: string) => string | undefined,
  id: string,
  actorId: string,
  agentId: string | null,
  phone: string,
  message: string,
  now = Date.now,
) {
  if (!smsUuid.test(id) || !message.trim() || message.length > 1000)
    throw new Error("Invalid SMS request");
  const config = egabConfig(env);
  if (config.base !== "https://egabsms.com") throw new Error("Unexpected EGAB host");
  const body = JSON.stringify({
    to: normalizeNigerianPhone(phone),
    message,
    sender_id: "eAlert",
    message_category: "transactional",
  });
  const digest = await bodyDigest(body);
  const row = await store.reserve({
    id,
    actor_id: actorId,
    agent_id: agentId,
    body_hash: digest,
    status: "reserved",
  });
  if (row.actor_id !== actorId || row.body_hash !== digest)
    throw new Error("SMS key belongs to another request");
  if (row.reference || row.status === "rejected") return { sms: row.result };
  if (
    !Number.isFinite(Date.parse(row.created_at)) ||
    now() - Date.parse(row.created_at) >= 23 * 3600000
  )
    throw new Error("SMS retry window expired; reconcile with EGAB before sending again");
  const path = "/api/v1/bulksms/sms";
  const timestamp = Math.floor(now() / 1000).toString();
  const dispatch: BrowserSmsRequest = {
    id,
    url: config.base + path,
    method: "POST",
    body,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Egab-Key": config.key,
      "X-Egab-Timestamp": timestamp,
      "X-Egab-Signature": await signEgab("POST", path, body, timestamp, config.secret),
      "Idempotency-Key": id,
    },
  };
  return { dispatch, sms: { id, status: "reserved" } };
}
