import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch pending items ready to send
    const { data: queueItems } = await supabase
      .from("whatsapp_outreach_queue")
      .select("*, agent:agents(*), instance:whatsapp_instances(*)")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(15);

    let sentCount = 0;
    let notOnWaCount = 0;
    let failedCount = 0;

    if (queueItems && queueItems.length > 0) {
      for (const item of queueItems) {
        const inst = item.instance;
        const agent = item.agent;

        if (!inst || inst.wa_state !== "authorized") {
          await supabase
            .from("whatsapp_outreach_queue")
            .update({ status: "failed", error_message: "Instance not authorized" })
            .eq("id", item.id);
          failedCount++;
          continue;
        }

        const stateId = inst.state_id;

        // Fetch state config
        const { data: config } = await supabase
          .from("whatsapp_state_config")
          .select("*")
          .eq("state_id", stateId)
          .single();

        let cleanPhone = String(item.voter_phone).replace(/\D/g, "");
        if (cleanPhone.startsWith("0")) {
          cleanPhone = "234" + cleanPhone.substring(1);
        } else if (!cleanPhone.startsWith("234") && cleanPhone.length === 10) {
          cleanPhone = "234" + cleanPhone;
        }
        const chatId = `${cleanPhone}@c.us`;

        // Check if on WhatsApp
        try {
          const checkRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/checkWhatsapp/${inst.api_token_instance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phoneNumber: parseInt(cleanPhone, 10) })
          });
          const checkData = await checkRes.json();

          if (!checkData.existsWhatsapp) {
            await supabase
              .from("whatsapp_outreach_queue")
              .update({ status: "not_on_whatsapp", sent_at: new Date().toISOString() })
              .eq("id", item.id);
            notOnWaCount++;
            continue;
          }

          // Build message caption
          let caption = config?.default_message_template || "Hello {{voter_name}}, greetings from ADC!";
          caption = caption
            .replace(/\{\{voter_name\}\}/g, item.voter_name || "Voter")
            .replace(/\{\{agent_name\}\}/g, agent?.name || "Field Agent")
            .replace(/\{\{ward_name\}\}/g, "your Ward");

          let messageId = "";
          let sendResData;

          if (config?.default_flyer_url) {
            const fileName = config.default_flyer_type === "video" ? "adc_flyer.mp4" : "adc_flyer.jpg";
            const sendRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/sendFileByUrl/${inst.api_token_instance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chatId,
                urlFile: config.default_flyer_url,
                fileName,
                caption
              })
            });
            sendResData = await sendRes.json();
            messageId = sendResData.idMessage || "";
          } else {
            const sendRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/sendMessage/${inst.api_token_instance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chatId, message: caption })
            });
            sendResData = await sendRes.json();
            messageId = sendResData.idMessage || "";
          }

          // Update queue record
          await supabase
            .from("whatsapp_outreach_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              message_id: messageId
            })
            .eq("id", item.id);

          // Update/create conversation
          const { data: conv } = await supabase
            .from("whatsapp_conversations")
            .upsert({
              agent_id: item.agent_id,
              instance_id: inst.id,
              voter_phone: cleanPhone,
              voter_name: item.voter_name,
              voter_id: item.voter_id || null,
              chat_id: chatId,
              last_message_at: new Date().toISOString()
            }, { onConflict: "agent_id,chat_id" })
            .select()
            .single();

          if (conv) {
            await supabase.from("whatsapp_messages").insert({
              conversation_id: conv.id,
              instance_id: inst.id,
              direction: "outgoing",
              sender_phone: inst.phone_number || "",
              chat_id: chatId,
              message_type: config?.default_flyer_url ? config.default_flyer_type : "text",
              message_text: caption,
              media_url: config?.default_flyer_url || null,
              green_api_message_id: messageId,
              delivery_status: "sent"
            });
          }

          // Credit agent earnings
          const earningAmount = Number(config?.earning_per_chat || 50);
          if (earningAmount > 0) {
            const { data: ag } = await supabase.from("agents").select("whatsapp_earnings_balance").eq("id", item.agent_id).single();
            const newBal = Number(ag?.whatsapp_earnings_balance || 0) + earningAmount;
            await supabase.from("agents").update({ whatsapp_earnings_balance: newBal }).eq("id", item.agent_id);
          }

          sentCount++;
        } catch (itemErr: any) {
          console.error(`Failed to process outreach item ${item.id}:`, itemErr);
          await supabase
            .from("whatsapp_outreach_queue")
            .update({ status: "failed", error_message: itemErr.message })
            .eq("id", item.id);
          failedCount++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: queueItems?.length || 0,
      sent: sentCount,
      notOnWhatsapp: notOnWaCount,
      failed: failedCount
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("Outreach runner error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
