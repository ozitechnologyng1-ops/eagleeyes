import { supabase } from "./supabase";

export interface SmsResult {
  id: string;
  status: string;
  reference?: string;
  sender_id?: string;
  message_category?: string;
  request_id?: string;
  code?: string;
  segments?: number;
  encoding?: string;
}

const encoder = new TextEncoder();
const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

export function normalizeNigerianPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    return "0" + digits.slice(3);
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return digits;
  }
  return phone.trim();
}

export async function signEgabRequest(
  method: string,
  path: string,
  rawBody: string,
  timestamp: string,
  secretKey: string,
): Promise<string> {
  const bodyHashBuf = await crypto.subtle.digest("SHA-256", encoder.encode(rawBody));
  const bodyHash = toHex(bodyHashBuf);
  const normalizedPath = "/" + path.split("?")[0].replace(/^\/+/, "");
  const canonical = [method.toUpperCase(), normalizedPath, bodyHash, timestamp].join("\n");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(canonical));
  return toHex(signatureBuf);
}

/**
 * Tracks SMS details in the Supabase `sms_logs` table.
 */
export async function trackSmsInDatabase(payload: {
  id: string;
  recipient: string;
  message: string;
  messageJson?: Record<string, unknown>;
  status: string;
  reference?: string;
  senderId?: string;
  category?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.from("sms_logs").insert({
      id: payload.id,
      recipient: payload.recipient,
      message: payload.message,
      message_json: payload.messageJson || {
        to: payload.recipient,
        message: payload.message,
      },
      status: payload.status,
      reference: payload.reference || null,
      sender_id: payload.senderId || null,
      category: payload.category || null,
      request_id: payload.requestId || null,
      metadata: payload.metadata || {},
    });
    console.log("[EGAB SMS] Successfully recorded in Supabase `sms_logs` table.");
  } catch (err) {
    console.warn("[EGAB SMS] Failed to write to Supabase `sms_logs`:", err);
  }
}

/**
 * Sends SMS via Vercel /api/egab-sms route if available, or direct browser send fallback.
 */
export async function sendDirectEgabSms(
  to: string,
  message: string,
  customId?: string,
  messageJson?: Record<string, unknown>,
  metadata?: Record<string, unknown>,
): Promise<SmsResult> {
  const targetPhone = normalizeNigerianPhone(to);
  const id = customId || crypto.randomUUID();

  // 1. Try Vercel Serverless Function first (/api/egab-sms)
  try {
    const vercelRes = await fetch("/api/egab-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: targetPhone,
        message,
        messageJson,
        metadata,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (vercelRes.ok) {
      const vercelJson = await vercelRes.json();
      if (vercelJson?.data) {
        console.log("[EGAB SMS] Sent successfully via Vercel route:", vercelJson.data);
        return {
          id: vercelJson.data.id || id,
          status: vercelJson.data.status || "pending",
          reference: vercelJson.data.reference,
          sender_id: vercelJson.data.sender_id,
          message_category: vercelJson.data.message_category,
          request_id: vercelJson.data.request_id,
        };
      }
    }
  } catch {
    // If running in local Vite dev server without Vercel CLI, fall through to direct send
    console.log(
      "[EGAB SMS] /api/egab-sms endpoint not reached; proceeding with direct browser send...",
    );
  }

  // 2. Direct browser send
  const publicKey = import.meta.env.VITE_EGAB_KEY || "egab_pk_live_lkTkDbHKK3m4KZ1uN2d2gBNC";
  const secretKey =
    import.meta.env.VITE_EGAB_SECRET || "egab_sk_live_wA1gHX6hpXJ5Agm3hfDvGTyE9dATgmFh";
  const base = import.meta.env.VITE_EGAB_BASE || "https://egabsms.com";
  const path = "/api/v1/bulksms/sms";

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({
    to: targetPhone,
    message,
  });

  console.log("[EGAB SMS] Direct Outbound Request:", {
    to: targetPhone,
    message,
    id,
    timestamp,
    endpoint: `${base}${path}`,
  });

  try {
    const signature = await signEgabRequest("POST", path, body, timestamp, secretKey);
    const headers = {
      "X-Egab-Key": publicKey,
      "X-Egab-Timestamp": timestamp,
      "X-Egab-Signature": signature,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": id,
    };

    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body,
    });

    const resText = await res.text();
    let resJson: any = null;
    try {
      resJson = JSON.parse(resText);
    } catch {
      // Non-JSON response
    }

    console.log("[EGAB SMS] Provider Response:", {
      status: res.status,
      statusText: res.statusText,
      body: resJson || resText,
    });

    if (!res.ok || (resJson && resJson.success === false)) {
      const errorMsg =
        resJson?.message ||
        resJson?.error ||
        `EGAB HTTP ${res.status}: ${res.statusText || resText.slice(0, 100)}`;
      console.error("[EGAB SMS] Rejection:", errorMsg);

      await trackSmsInDatabase({
        id,
        recipient: targetPhone,
        message,
        messageJson,
        status: "failed",
        metadata: { error: errorMsg, httpStatus: res.status },
      });

      return {
        id,
        status: "failed",
        code: `HTTP_${res.status}`,
      };
    }

    const data = resJson?.data || {};
    const result: SmsResult = {
      id,
      status: data.status || "pending",
      reference: data.reference,
      sender_id: data.sender_id,
      message_category: data.message_category,
      request_id: resJson?.meta?.request_id || resJson?.trace_id,
    };

    // Track in Supabase
    await trackSmsInDatabase({
      id,
      recipient: targetPhone,
      message,
      messageJson,
      status: result.status,
      reference: result.reference,
      senderId: result.sender_id,
      category: result.message_category,
      requestId: result.request_id,
      metadata: { ...metadata, httpStatus: res.status },
    });

    return result;
  } catch (err: any) {
    console.error("[EGAB SMS] Network/Execution Error:", err);
    throw new Error(err.message || "Failed to deliver SMS via EGAB");
  }
}

export function getLoginUrlForState(
  stateId?: number | string | null,
  stateName?: string | null,
  siteUrl?: string,
): string {
  const normName = String(stateName || "")
    .trim()
    .toLowerCase();
  const idNum =
    stateId !== undefined && stateId !== null && stateId !== "" ? Number(stateId) : null;

  // 1. If state is Ogun (id 27 in database, or name is Ogun) -> use ogunadc.com
  if (idNum === 27 || normName === "ogun" || normName.includes("ogun")) {
    return "https://ogunadc.com/login";
  }

  // 2. If a custom siteUrl is explicitly provided that isn't localhost or ogunadc
  if (
    siteUrl &&
    !siteUrl.includes("localhost") &&
    !siteUrl.includes("127.0.0.1") &&
    !siteUrl.includes("ogunadc.com")
  ) {
    return `${siteUrl.replace(/\/$/, "")}/login`;
  }

  // 3. Fallback for Lagos and all other states without dedicated domain
  return "https://eagleeyess.vercel.app/";
}

export function buildLoginSms(
  vars: {
    firstname: string;
    phone: string;
    password: string;
    stateId?: number | string | null;
    stateName?: string | null;
  },
  origin?: string,
  stateId?: number | string | null,
  stateName?: string | null,
) {
  const effectiveStateId = vars.stateId ?? stateId;
  const effectiveStateName = vars.stateName ?? stateName;
  const loginUrl = getLoginUrlForState(effectiveStateId, effectiveStateName, origin);
  return `Hello ${vars.firstname.replace(/[\r\n]/g, " ")}, your account is ready. Phone: ${vars.phone}. Password: ${vars.password}. Login: ${loginUrl}. Please keep your password safe and private.`;
}

export async function sendRegistrationSms(vars: {
  firstname: string;
  phone: string;
  password: string;
  siteUrl?: string;
  agentId?: string;
  stateId?: number | string | null;
  stateName?: string | null;
}): Promise<SmsResult> {
  const loginUrl = getLoginUrlForState(vars.stateId, vars.stateName, vars.siteUrl);
  const message = buildLoginSms(vars, vars.siteUrl, vars.stateId, vars.stateName);
  const messageJson = {
    type: "agent_registration_credentials",
    recipient: vars.phone,
    firstname: vars.firstname,
    phone: vars.phone,
    password: vars.password,
    login_url: loginUrl,
    state_id: vars.stateId || null,
    timestamp: new Date().toISOString(),
  };

  return sendDirectEgabSms(vars.phone, message, undefined, messageJson, {
    agent_id: vars.agentId,
    state_id: vars.stateId,
    site_url: loginUrl,
  });
}

export function sendTestSms(to: string, id: string): Promise<SmsResult> {
  const message = "EagleEye SMS configuration test.";
  const messageJson = {
    type: "admin_test_sms",
    recipient: to,
    message,
    timestamp: new Date().toISOString(),
  };
  return sendDirectEgabSms(to, message, id, messageJson, { test: true });
}

export async function getSmsStatus(referenceOrId: string): Promise<SmsResult> {
  // 1. Try Vercel Serverless Function first
  try {
    const vercelRes = await fetch(`/api/egab-sms?reference=${encodeURIComponent(referenceOrId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (vercelRes.ok) {
      const vercelJson = await vercelRes.json();
      if (vercelJson?.data?.status) {
        return {
          id: referenceOrId,
          reference: vercelJson.data.reference || referenceOrId,
          status: vercelJson.data.status,
          sender_id: vercelJson.data.sender_id,
          message_category: vercelJson.data.message_category,
          request_id: vercelJson?.meta?.request_id,
        };
      }
    }
  } catch {
    // Fall through to direct query
  }

  // 2. Direct query fallback
  const base = import.meta.env.VITE_EGAB_BASE || "https://egabsms.com";
  const publicKey = import.meta.env.VITE_EGAB_KEY || "egab_pk_live_lkTkDbHKK3m4KZ1uN2d2gBNC";
  const secretKey =
    import.meta.env.VITE_EGAB_SECRET || "egab_sk_live_wA1gHX6hpXJ5Agm3hfDvGTyE9dATgmFh";
  const path = `/api/v1/bulksms/sms/${encodeURIComponent(referenceOrId)}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  try {
    const signature = await signEgabRequest("GET", path, "", timestamp, secretKey);
    const res = await fetch(`${base}${path}`, {
      method: "GET",
      headers: {
        "X-Egab-Key": publicKey,
        "X-Egab-Timestamp": timestamp,
        "X-Egab-Signature": signature,
        Accept: "application/json",
      },
    });
    const resJson = await res.json();
    console.log("[EGAB SMS] Status Query Response:", resJson);
    if (resJson?.data?.status) {
      // Sync update to Supabase sms_logs table
      try {
        await supabase
          .from("sms_logs")
          .update({
            status: resJson.data.status,
            updated_at: new Date().toISOString(),
          })
          .eq("reference", referenceOrId);
      } catch (dbErr) {
        console.warn("[EGAB SMS] Failed to update delivery status in Supabase:", dbErr);
      }

      return {
        id: referenceOrId,
        reference: resJson.data.reference || referenceOrId,
        status: resJson.data.status,
        sender_id: resJson.data.sender_id,
        message_category: resJson.data.message_category,
        request_id: resJson?.meta?.request_id,
      };
    }
  } catch (err) {
    console.warn("[EGAB SMS] Direct status query fallback error:", err);
  }

  return { id: referenceOrId, status: "unknown" };
}

export function retryCredentialSms(to: string, message: string): Promise<SmsResult> {
  return sendDirectEgabSms(to, message);
}
