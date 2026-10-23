import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 30,
};

function normalizeNigerianPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    return "0" + digits.slice(3);
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return digits;
  }
  return phone.trim();
}

export default async function handler(req: any, res: any) {
  // CORS Handling
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Agent-Session");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const publicKey = process.env.EGAB_KEY || process.env.VITE_EGAB_KEY;
  const secretKey = process.env.EGAB_SECRET || process.env.VITE_EGAB_SECRET;
  const base = process.env.EGAB_BASE || process.env.VITE_EGAB_BASE || "https://egabsms.com";

  if (!publicKey || !secretKey) {
    return res.status(500).json({ error: "EGAB credentials are not configured on the server" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  // --- GET: Check delivery status ---
  if (req.method === "GET") {
    const reference = req.query?.reference as string;
    if (!reference) {
      return res.status(400).json({ error: "Missing required 'reference' query parameter" });
    }

    const path = `/api/v1/bulksms/sms/${encodeURIComponent(reference)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyHash = crypto.createHash("sha256").update("").digest("hex");
    const canonical = ["GET", path, bodyHash, timestamp].join("\n");
    const signature = crypto.createHmac("sha256", secretKey).update(canonical).digest("hex");

    try {
      const upstream = await fetch(`${base}${path}`, {
        method: "GET",
        headers: {
          "X-Egab-Key": publicKey,
          "X-Egab-Timestamp": timestamp,
          "X-Egab-Signature": signature,
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });

      const resJson = await upstream.json().catch(() => null);
      if (resJson?.data?.status && supabaseUrl && supabaseKey) {
        try {
          const supabase = createClient(supabaseUrl, supabaseKey);
          await supabase
            .from("sms_logs")
            .update({
              status: resJson.data.status,
              updated_at: new Date().toISOString(),
            })
            .eq("reference", reference);
        } catch (dbErr) {
          console.warn("[Vercel /api/egab-sms] Status DB update error:", dbErr);
        }
      }
      return res.status(upstream.status).json(resJson || { error: "Invalid status response" });
    } catch (err: any) {
      return res.status(502).json({ error: "Failed to query EGAB status", details: err.message });
    }
  }

  // --- POST: Send SMS ---
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, message, messageJson, metadata } = req.body || {};

  if (!to || !message) {
    return res.status(400).json({ error: "Missing required 'to' or 'message' field" });
  }

  const path = "/api/v1/bulksms/sms";
  const targetPhone = normalizeNigerianPhone(to);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const idempotencyKey = crypto.randomUUID();

  const payloadString = JSON.stringify({
    to: targetPhone,
    message,
  });

  const bodyHash = crypto.createHash("sha256").update(payloadString).digest("hex");
  const canonical = ["POST", path, bodyHash, timestamp].join("\n");
  const signature = crypto.createHmac("sha256", secretKey).update(canonical).digest("hex");

  console.log("[Vercel /api/egab-sms] Outbound Request:", {
    to: targetPhone,
    message,
    idempotencyKey,
    timestamp,
  });

  let egabResponse: any = null;
  let responseText = "";
  let httpStatus = 500;

  try {
    const upstream = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "X-Egab-Key": publicKey,
        "X-Egab-Timestamp": timestamp,
        "X-Egab-Signature": signature,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      body: payloadString,
      signal: AbortSignal.timeout(20000),
    });

    httpStatus = upstream.status;
    responseText = await upstream.text();
    try {
      egabResponse = JSON.parse(responseText);
    } catch {
      egabResponse = null;
    }
  } catch (netErr: any) {
    console.error("[Vercel /api/egab-sms] Upstream Fetch Failed:", netErr);
    return res.status(502).json({
      error: "Failed to connect to EGAB provider",
      details: netErr.message,
    });
  }

  const success = httpStatus >= 200 && httpStatus < 300 && egabResponse?.success !== false;
  const egabData = egabResponse?.data || {};

  // Track in Supabase sms_logs table
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from("sms_logs").insert({
        id: idempotencyKey,
        recipient: targetPhone,
        message,
        message_json: messageJson || {
          to: targetPhone,
          message,
        },
        status: egabData.status || (success ? "pending" : "failed"),
        reference: egabData.reference || null,
        sender_id: egabData.sender_id || null,
        category: egabData.message_category || null,
        request_id: egabResponse?.meta?.request_id || null,
        metadata: {
          ...metadata,
          provider_http_status: httpStatus,
          raw_response: egabResponse || responseText.slice(0, 300),
        },
      });
      console.log("[Vercel /api/egab-sms] Tracked in Supabase sms_logs table.");
    } catch (dbErr) {
      console.warn("[Vercel /api/egab-sms] DB Tracking Warning:", dbErr);
    }
  }

  if (!success) {
    return res.status(httpStatus).json({
      error: egabResponse?.message || `Provider returned status ${httpStatus}`,
      raw: egabResponse || responseText,
    });
  }

  return res.status(201).json({
    success: true,
    data: {
      id: idempotencyKey,
      status: egabData.status || "pending",
      reference: egabData.reference,
      sender_id: egabData.sender_id,
      message_category: egabData.message_category,
      request_id: egabResponse?.meta?.request_id,
    },
  });
}
