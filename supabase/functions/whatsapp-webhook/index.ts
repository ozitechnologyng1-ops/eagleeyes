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
    const body = await req.json().catch(() => ({}));

    const { typeWebhook, instanceData, senderData, messageData, stateInstance, idMessage, status } = body;
    const idInstance = instanceData?.idInstance;

    if (!idInstance) {
      return new Response(JSON.stringify({ received: true, note: "No instance ID" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Lookup corresponding instance in DB
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("*, state:whatsapp_state_config(*)")
      .eq("id_instance", idInstance)
      .single();

    if (!inst) {
      return new Response(JSON.stringify({ received: true, note: "Instance not registered in DB" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1. Handle State Changes (authorized, notAuthorized, blocked, etc.)
    if (typeWebhook === "stateInstanceChanged") {
      const newState = stateInstance || body.stateInstance || "notAuthorized";
      let phone = inst.phone_number;

      if (newState === "authorized" && !phone) {
        // Fetch phone number
        const setRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/getWaSettings/${inst.api_token_instance}`);
        if (setRes.ok) {
          const s = await setRes.json();
          phone = s.phone || s.wid?.split("@")[0] || null;
        }
      }

      await supabase
        .from("whatsapp_instances")
        .update({
          wa_state: newState,
          phone_number: phone,
          pool_status: newState === "authorized" ? "assigned" : (newState === "blocked" ? "banned" : inst.pool_status),
          updated_at: new Date().toISOString()
        })
        .eq("id", inst.id);

      return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
    }

    // 2. Handle Outgoing Message Status (sent -> delivered -> read)
    if (typeWebhook === "outgoingMessageStatus") {
      if (idMessage && status) {
        await supabase
          .from("whatsapp_messages")
          .update({ delivery_status: status })
          .eq("green_api_message_id", idMessage);

        await supabase
          .from("whatsapp_outreach_queue")
          .update({ status })
          .eq("message_id", idMessage);
      }
      return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
    }

    // 3. Handle Incoming Message from Voter
    if (typeWebhook === "incomingMessageReceived") {
      const chatId = senderData?.chatId || "";
      const senderPhone = senderData?.sender?.split("@")[0] || chatId.split("@")[0] || "";
      const senderName = senderData?.senderName || senderData?.chatName || "Voter";
      const agentId = inst.assigned_agent_id;

      // Only handle personal chats (@c.us) on this webhook
      if (!chatId.endsWith("@c.us")) {
        return new Response(JSON.stringify({ received: true, note: "Skipped non-personal chat" }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // Extract message content
      let text = "";
      let messageType = "text";
      let mediaUrl = null;

      if (messageData?.typeMessage === "textMessage") {
        text = messageData.textMessageData?.textMessage || "";
      } else if (messageData?.typeMessage === "extendedTextMessage") {
        text = messageData.extendedTextMessageData?.text || "";
      } else if (messageData?.typeMessage === "imageMessage") {
        messageType = "image";
        text = messageData.imageMessageData?.caption || "";
        mediaUrl = messageData.imageMessageData?.downloadUrl || null;
      }

      if (agentId) {
        // Find or create conversation
        let { data: conv } = await supabase
          .from("whatsapp_conversations")
          .select("*")
          .eq("agent_id", agentId)
          .eq("chat_id", chatId)
          .maybeSingle();

        if (!conv) {
          // Attempt to match voter record by phone
          const { data: matchedVoter } = await supabase
            .from("voters")
            .select("id, first_name, last_name")
            .ilike("phone_number", `%${senderPhone.slice(-10)}%`)
            .maybeSingle();

          const { data: newConv } = await supabase
            .from("whatsapp_conversations")
            .insert({
              agent_id: agentId,
              instance_id: inst.id,
              voter_phone: senderPhone,
              voter_name: matchedVoter ? `${matchedVoter.first_name} ${matchedVoter.last_name}` : senderName,
              voter_id: matchedVoter?.id || null,
              chat_id: chatId,
              last_message_at: new Date().toISOString(),
              message_count: 1
            })
            .select()
            .single();

          conv = newConv;
        } else {
          await supabase
            .from("whatsapp_conversations")
            .update({
              last_message_at: new Date().toISOString(),
              message_count: (conv.message_count || 1) + 1,
              updated_at: new Date().toISOString()
            })
            .eq("id", conv.id);
        }

        if (conv) {
          // Insert message record
          await supabase.from("whatsapp_messages").insert({
            conversation_id: conv.id,
            instance_id: inst.id,
            direction: "incoming",
            sender_phone: senderPhone,
            chat_id: chatId,
            message_type: messageType,
            message_text: text,
            media_url: mediaUrl,
            green_api_message_id: idMessage || null,
            delivery_status: "delivered"
          });

          // Run AI Sentiment & Conversion Analysis on incoming text
          if (text && text.trim().length > 3) {
            const { data: stateCfg } = await supabase
              .from("whatsapp_state_config")
              .select("*")
              .eq("state_id", inst.state_id)
              .maybeSingle();

            const aiKey = stateCfg?.ai_api_key || Deno.env.get("VITE_GOOGLE_AI_KEY") || Deno.env.get("GEMINI_API_KEY") || "";

            if (aiKey) {
              try {
                const prompt = `You are an election canvassing sentiment analyst. Analyze this incoming WhatsApp voter response:
"${text}"

Respond in pure JSON with format:
{
  "sentiment": number between -1.0 and 1.0,
  "stance": "ADC Supporter" | "Undecided" | "Opposition" | "Unreachable",
  "converted": boolean,
  "summary": "one brief sentence"
}`;

                const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiKey}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                  })
                });

                if (aiRes.ok) {
                  const aiData = await aiRes.json();
                  const rawJson = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (rawJson) {
                    const parsed = JSON.parse(rawJson);

                    await supabase
                      .from("whatsapp_conversations")
                      .update({
                        ai_sentiment_score: parsed.sentiment,
                        conversion_status: parsed.converted ? "converted" : (parsed.sentiment > 0.3 ? "engaged" : conv.conversion_status),
                        ai_analysis: parsed,
                        updated_at: new Date().toISOString()
                      })
                      .eq("id", conv.id);

                    // If converted, credit conversion bonus to agent and update voter status
                    if (parsed.converted && conv.conversion_status !== "converted") {
                      const conversionBonus = Number(stateCfg?.earning_per_conversion || 200);
                      if (conversionBonus > 0) {
                        const { data: ag } = await supabase.from("agents").select("whatsapp_earnings_balance").eq("id", agentId).single();
                        const newBal = Number(ag?.whatsapp_earnings_balance || 0) + conversionBonus;
                        await supabase.from("agents").update({ whatsapp_earnings_balance: newBal }).eq("id", agentId);
                      }

                      if (conv.voter_id) {
                        await supabase.from("voters").update({ status: "ADC Supporter" }).eq("id", conv.voter_id);
                      }
                    }
                  }
                }
              } catch (aiErr) {
                console.error("AI sentiment evaluation failed:", aiErr);
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ received: true, unhandled: typeWebhook }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
