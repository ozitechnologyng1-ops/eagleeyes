const encoder = new TextEncoder();
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function bodyDigest(raw: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(raw)));
}

export function normalizedPath(path: string) {
  return "/" + path.split("?")[0].replace(/^\/+/, "");
}

export async function signEgab(
  method: string,
  path: string,
  raw: string,
  timestamp: string,
  secret: string,
) {
  const canonical = [
    method.toUpperCase(),
    normalizedPath(path),
    await bodyDigest(raw),
    timestamp,
  ].join("\n");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(canonical)));
}

export interface EgabConfig {
  base: string;
  key: string;
  secret: string;
}

export class EgabConfigError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function egabConfig(env: (key: string) => string | undefined): EgabConfig {
  const base = env("EGAB_BASE");
  const key = env("EGAB_KEY");
  const secret = env("EGAB_SECRET");
  if (!base) throw new EgabConfigError("EGAB_BASE_MISSING", "EGAB_BASE is not configured");
  if (!key || !/^(?:egab_)?pk_\S+$/.test(key))
    throw new EgabConfigError(
      "EGAB_KEY_INVALID",
      "EGAB_KEY must contain the issued public key (pk_ or egab_pk_)",
    );
  if (!secret || !/^(?:egab_)?sk_\S+$/.test(secret))
    throw new EgabConfigError(
      "EGAB_SECRET_INVALID",
      "EGAB_SECRET must contain the issued secret key (sk_ or egab_sk_)",
    );
  const keyMode = /^(?:egab_)?pk_(test|live)_/.exec(key)?.[1];
  const secretMode = /^(?:egab_)?sk_(test|live)_/.exec(secret)?.[1];
  if (keyMode && secretMode && keyMode !== secretMode)
    throw new EgabConfigError(
      "EGAB_KEY_MODE_MISMATCH",
      "EGAB public and secret keys must belong to the same test or live pair",
    );
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new EgabConfigError(
      "EGAB_BASE_INVALID",
      "EGAB_BASE must be the HTTPS host issued with the keys",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !["/", "/api/v1/bulksms", "/api/v1/bulksms/sms"].includes(
      url.pathname.replace(/\/$/, "") || "/",
    ) ||
    url.search ||
    url.hash
  )
    throw new EgabConfigError(
      "EGAB_BASE_INVALID",
      "EGAB_BASE must be the HTTPS host issued with the keys",
    );
  return { base: url.origin, key, secret };
}

export function normalizeNigerianPhone(phone: string) {
  const compact = phone.replace(/[\s()-]/g, "");
  const local = compact.replace(/^(?:\+234|234|0)/, "");
  if (!/^[789]\d{9}$/.test(local)) throw new Error("Invalid Nigerian phone number");
  return "+234" + local;
}

export type EgabEnvelope = {
  success?: boolean;
  data?: { reference?: string; status?: string; sender_id?: string; message_category?: string };
  error?: string | { code?: string };
  meta?: { request_id?: string };
  trace_id?: string;
};

export class EgabError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
    public diagnostics?: { content_type: string | null; server: string | null; error_page: string },
  ) {
    super(egabErrorMessage(status, code));
  }
}

export function egabErrorMessage(status: number, code: string) {
  if (status === 406)
    return "EGAB rejected the HTTP request (406); check API request filtering with EGAB";
  if (status === 401) return "EGAB authentication failed; check server keys and clock";
  if (status === 403) return "EGAB SMS API capability is missing";
  if (status === 402) return "EGAB balance is insufficient";
  if (code === "sender_id_not_approved" || code === "sender_id_type_mismatch")
    return "EGAB sender approval or category needs attention";
  if (code === "spam_keyword_blocked") return "EGAB blocked the message content";
  if (status === 422) return "EGAB rejected the message fields";
  if (code === "IDEMPOTENCY_KEY_REUSED") return "SMS key was already used for different content";
  return "SMS outcome is uncertain; retain the original submission key";
}

export function createEgabClient(
  config: EgabConfig,
  transport: typeof fetch = fetch,
  now = Date.now,
) {
  return async (method: "GET" | "POST", path: string, raw = "", idempotencyKey?: string) => {
    if (method === "POST" && !idempotencyKey) throw new Error("SMS submission key required");
    const timestamp = Math.floor(now() / 1000).toString();
    const headers: Record<string, string> = {
      "X-Egab-Key": config.key,
      "X-Egab-Timestamp": timestamp,
      "X-Egab-Signature": await signEgab(method, path, raw, timestamp, config.secret),
      Accept: "application/json",
      "User-Agent": "EagleEye/1.0",
    };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      headers["Idempotency-Key"] = idempotencyKey!;
    }
    let response: Response;
    try {
      response = await transport(config.base + normalizedPath(path), {
        method,
        headers,
        body: method === "POST" ? raw : undefined,
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      throw new EgabError(0, "OUTCOME_UNKNOWN");
    }
    const responseText = await response.text();
    let body: EgabEnvelope = {};
    try {
      const parsed = JSON.parse(responseText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
    } catch {
      /* Non-JSON hosting errors are diagnosed without exposing request headers. */
    }
    const requestId =
      body.meta?.request_id || body.trace_id || response.headers.get("X-Request-Id") || undefined;
    if (!response.ok || body.success === false) {
      const code =
        typeof body.error === "string"
          ? body.error
          : body.error?.code ||
            (response.status >= 500 ? "SERVER_ERROR" : `HTTP_${response.status}`);
      const diagnostics =
        response.status === 406
          ? {
              content_type: response.headers.get("content-type"),
              server: response.headers.get("server"),
              error_page: /text\/html/i.test(response.headers.get("content-type") || "")
                ? responseText
                    .slice(0, 4096)
                    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
                    .replace(/<[^>]*>/g, " ")
                    .replace(/(?:egab_)?(?:pk|sk)_[A-Za-z0-9_]+/g, "[redacted-key]")
                    .replace(/\b[a-f0-9]{64}\b/gi, "[redacted-digest]")
                    .replace(/\+?\d{10,15}\b/g, "[redacted-number]")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 400)
                : "Non-HTML response; raw content withheld",
            }
          : undefined;
      throw new EgabError(response.status, code, requestId, diagnostics);
    }
    if (response.status !== (method === "POST" ? 201 : 200))
      throw new EgabError(response.status, "INVALID_RESPONSE", requestId);
    return { data: body.data, requestId };
  };
}

const gsm =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const extended = "\f^{}\\[~]|€";
export function estimateSmsSegments(message: string) {
  let units = 0;
  let unicode = false;
  for (const character of message) {
    if (extended.includes(character)) units += 2;
    else if (gsm.includes(character)) units++;
    else unicode = true;
  }
  if (unicode) units = message.length;
  return {
    encoding: unicode ? "Unicode" : "GSM-7",
    segments: units <= (unicode ? 70 : 160) ? 1 : Math.ceil(units / (unicode ? 67 : 153)),
  };
}
