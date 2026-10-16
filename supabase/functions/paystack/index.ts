import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { authorizeAgentRequest } from "../_shared/agent-session.ts";
Deno.serve(async (req: Request) => {
  const access = await authorizeAgentRequest(req, "paystack", 16384);
  if (access instanceof Response) return access;
  const { headers: corsHeaders, body } = access;
  try {
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!PAYSTACK_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: "PAYSTACK_SECRET_KEY secret is not configured in Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { action, accountNumber, bankCode } = body;

    const headers = {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    };

    if (action === "banks") {
      const res = await fetch("https://api.paystack.co/bank?currency=NGN&perPage=300", {
        headers,
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      const json = await res.json();
      return new Response(JSON.stringify(json), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resolve") {
      if (
        typeof accountNumber !== "string" ||
        !/^[0-9]{10}$/.test(accountNumber) ||
        typeof bankCode !== "string" ||
        !/^[0-9]{3,9}$/.test(bankCode)
      ) {
        return new Response(
          JSON.stringify({
            status: false,
            message: "accountNumber and bankCode are required for resolution",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const res = await fetch(
        `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
        { headers, signal: AbortSignal.timeout(15000), redirect: "error" },
      );
      const json = await res.json();
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: false, message: `Invalid action: ${action}` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Bank verification unavailable; please retry" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
