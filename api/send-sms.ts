export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    } else if (!body) {
      body = await new Promise((resolve) => {
        let raw = "";
        req.on("data", (chunk: any) => {
          raw += chunk;
        });
        req.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({});
          }
        });
        req.on("error", () => resolve({}));
      });
    }

    const { to, message, accountSid, authToken, apiKeySid, apiSecret, fromNumber } = body || {};

    if (!to || !message) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          error: "Recipient phone number and message are required",
        }),
      );
      return;
    }

    // Default Twilio configuration from environment variables
    const targetAccountSid = accountSid || process.env.TWILIO_ACCOUNT_SID || "";
    const targetAuthToken = authToken || process.env.TWILIO_AUTH_TOKEN || "";
    const targetApiKeySid = apiKeySid || process.env.TWILIO_API_KEY_SID;
    const targetApiSecret = apiSecret || process.env.TWILIO_API_SECRET;
    const targetFrom = fromNumber || "EagleEye";

    // Normalize phone number to international E.164 format
    let cleanPhone = String(to).replace(/[^0-9+]/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "+234" + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith("234")) {
      cleanPhone = "+" + cleanPhone;
    } else if (!cleanPhone.startsWith("+")) {
      cleanPhone = "+" + cleanPhone;
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${targetAccountSid}/Messages.json`;

    // Authenticate with either API Key (SK...) + secret or Account SID + Auth Token
    const authUser = targetApiKeySid && targetApiSecret ? targetApiKeySid : targetAccountSid;
    const authPass = targetApiKeySid && targetApiSecret ? targetApiSecret : targetAuthToken;
    const basicAuth = Buffer.from(`${authUser}:${authPass}`).toString("base64");

    const params = new URLSearchParams();
    params.append("To", cleanPhone);
    params.append("Body", String(message));

    if (targetFrom.startsWith("MG")) {
      params.append("MessagingServiceSid", targetFrom);
    } else {
      params.append("From", targetFrom);
    }

    console.log("[Twilio Relay] Sending SMS:", {
      to: cleanPhone,
      from: targetFrom,
      accountSid: targetAccountSid,
      authMethod: apiKeySid && apiSecret ? "API_KEY" : "AUTH_TOKEN",
    });

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data: any = await twilioResponse.json();
    console.log("[Twilio Relay] Response status:", twilioResponse.status, "Body:", data);

    res.setHeader("Content-Type", "application/json");

    if (twilioResponse.ok) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          messageId: data.sid,
          status: data.status,
          twilioRaw: data,
        }),
      );
    } else {
      res.statusCode = twilioResponse.status || 400;
      res.end(
        JSON.stringify({
          success: false,
          error: data.message || "Twilio send failed",
          code: data.code,
          moreInfo: data.more_info,
          twilioRaw: data,
        }),
      );
    }
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: error?.message || "Internal server error while sending SMS",
      }),
    );
  }
}
