import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  bodyDigest,
  createEgabClient,
  egabConfig,
  EgabError,
  normalizeNigerianPhone,
  estimateSmsSegments,
} from "./egab.ts";
import { agentCorsHeaders } from "./agent-cors.ts";

export type SmsResult = {
  id: string;
  status: string;
  reference?: string;
  sender_id?: string;
  message_category?: string;
  request_id?: string;
  code?: string;
  segments?: number;
  encoding?: string;
  diagnostics?: EgabError["diagnostics"];
};
type Row = {
  id: string;
  actor_id: string;
  body_hash: string;
  status: string;
  reference?: string;
  created_at: string;
  result: SmsResult | null;
};
export interface SmsStore {
  reserve(
    this: void,
    row: {
      id: string;
      actor_id: string;
      agent_id: string | null;
      body_hash: string;
      status: string;
    },
  ): Promise<Row>;
  save(this: void, id: string, result: SmsResult): Promise<void>;
}
export function smsStore(client: SupabaseClient): SmsStore {
  return {
    async reserve(row) {
      const inserted = await client.from("agent_sms_submissions").insert(row).select().single();
      if (!inserted.error) return inserted.data;
      if (inserted.error.code !== "23505")
        throw new Error("SMS tracking unavailable; no send attempted");
      const existing = await client
        .from("agent_sms_submissions")
        .select()
        .eq("id", row.id)
        .single();
      if (existing.error) throw new Error("SMS tracking unavailable");
      return existing.data;
    },
    async save(id, result) {
      const { error } = await client
        .from("agent_sms_submissions")
        .update({
          status: result.status,
          reference: result.reference || null,
          result,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error)
        throw new Error(
          "SMS tracking unavailable; retain submission key and check status before retrying",
        );
    },
  };
}

export function loginMessage(
  name: string,
  phone: string,
  password: string,
  req: Request,
  allowedOrigins?: string,
) {
  agentCorsHeaders(req, allowedOrigins);
  const origin = req.headers.get("origin");
  if (!origin) throw new Error("Registration site origin required for the login URL");
  return `Hello ${name.replace(/[\r\n]/g, " ")}, your EagleEye account is ready. Phone: ${phone}. Password: ${password}. Login: ${origin}/login. Keep these details private.`;
}

export function createSmsService(
  store: SmsStore,
  env: (key: string) => string | undefined,
  transport: typeof fetch = fetch,
  now = Date.now,
) {
  return {
    async submit(
      id: string,
      actorId: string,
      agentId: string | null,
      phone: string,
      message: string,
      credentials = false,
    ): Promise<SmsResult> {
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
        throw new Error("Invalid SMS submission key");
      if (!message.trim() || message.length > 1000)
        throw new Error("SMS must contain 1–1000 characters");
      const request = createEgabClient(egabConfig(env), transport, now);
      const raw = JSON.stringify({ to: normalizeNigerianPhone(phone), message });
      const digest = await bodyDigest(raw);
      const row = await store.reserve({
        id,
        actor_id: actorId,
        agent_id: agentId,
        body_hash: digest,
        status: "reserved",
      });
      if (row.actor_id !== actorId || row.body_hash !== digest)
        throw new Error("SMS key already belongs to another request");
      if (row.reference || row.status === "rejected") return row.result!;
      if (now() - Date.parse(row.created_at) >= 23 * 60 * 60 * 1000)
        throw new Error(
          "SMS retry window expired; reconcile in EGAB before creating another submission",
        );
      try {
        if (credentials) {
          const registry = await request("GET", "/api/v1/bulksms/sender-ids");
          const senders = registry.data as unknown;
          if (
            !Array.isArray(senders) ||
            !senders.some(
              (sender) =>
                sender.is_default === true &&
                sender.status === "approved" &&
                sender.type === "transactional",
            )
          )
            throw new EgabError(422, "sender_id_type_mismatch", registry.requestId);
        }
        const response = await request("POST", "/api/v1/bulksms/sms", raw, id);
        const data = response.data;
        if (!data?.reference || !data.status || !data.sender_id || !data.message_category)
          throw new EgabError(0, "OUTCOME_UNKNOWN", response.requestId);
        const result = {
          id,
          reference: data.reference,
          sender_id: data.sender_id,
          message_category: data.message_category,
          status: data.status,
          request_id: response.requestId,
          ...estimateSmsSegments(message),
        };
        await store.save(id, result);
        return result;
      } catch (error) {
        if (!(error instanceof EgabError)) throw error;
        const result: SmsResult = {
          id,
          status: [400, 402, 404, 422].includes(error.status) ? "rejected" : "unknown",
          code: error.code,
          request_id: error.requestId,
          ...(agentId === null && error.diagnostics ? { diagnostics: error.diagnostics } : {}),
        };
        await store.save(id, result);
        console.warn("SMS submission", {
          id,
          status: error.status,
          code: error.code,
          requestId: error.requestId,
        });
        return result;
      }
    },
    async status(row: Row): Promise<SmsResult> {
      if (!row.reference) return row.result || { id: row.id, status: "unknown" };
      const response = await createEgabClient(
        egabConfig(env),
        transport,
        now,
      )("GET", `/api/v1/bulksms/sms/${encodeURIComponent(row.reference)}`);
      if (!response.data?.status) throw new Error("Invalid EGAB status response");
      const result = {
        ...row.result,
        id: row.id,
        reference: row.reference,
        status: response.data.status,
        sender_id: response.data.sender_id,
        message_category: response.data.message_category,
        request_id: response.requestId,
      };
      await store.save(row.id, result);
      return result;
    },
  };
}
