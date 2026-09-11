import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-id, x-agent-phone",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      // 1. Save or Update State Configuration
      case "saveConfig": {
        const { stateId, config } = body;
        const targetStateId = stateId || config?.state_id;
        if (!targetStateId) throw new Error("stateId is required");

        const updatePayload: Record<string, any> = {
          state_id: targetStateId,
          updated_at: new Date().toISOString()
        };

        const greenToken = config.green_api_partner_token ?? config.greenApiPartnerToken;
        if (greenToken !== undefined) updatePayload.green_api_partner_token = greenToken;

        const flyerUrl = config.default_flyer_url ?? config.defaultFlyerUrl;
        if (flyerUrl !== undefined) updatePayload.default_flyer_url = flyerUrl;

        const flyerType = config.default_flyer_type ?? config.defaultFlyerType;
        if (flyerType !== undefined) updatePayload.default_flyer_type = flyerType;

        const msgTemplate = config.default_message_template ?? config.defaultMessageTemplate;
        if (msgTemplate !== undefined) updatePayload.default_message_template = msgTemplate;

        const outreachMax = config.daily_outreach_max ?? config.dailyOutreachMax;
        if (outreachMax !== undefined) updatePayload.daily_outreach_max = outreachMax;

        const outreachEnabled = config.auto_outreach_enabled ?? config.autoOutreachEnabled;
        if (outreachEnabled !== undefined) updatePayload.auto_outreach_enabled = outreachEnabled;

        const intervalMins = config.message_interval_minutes ?? config.messageIntervalMinutes;
        if (intervalMins !== undefined) updatePayload.message_interval_minutes = intervalMins;

        const earnChat = config.earning_per_chat ?? config.earningPerChat;
        if (earnChat !== undefined) updatePayload.earning_per_chat = earnChat;

        const earnConv = config.earning_per_conversion ?? config.earningPerConversion;
        if (earnConv !== undefined) updatePayload.earning_per_conversion = earnConv;

        const earnGrp = config.earning_per_group_add ?? config.earningPerGroupAdd;
        if (earnGrp !== undefined) updatePayload.earning_per_group_add = earnGrp;

        const earnManualWa = config.earning_per_manual_wa ?? config.earningPerManualWa;
        if (earnManualWa !== undefined) updatePayload.earning_per_manual_wa = earnManualWa;

        const earnCall = config.earning_per_call ?? config.earningPerCall;
        if (earnCall !== undefined) updatePayload.earning_per_call = earnCall;

        const msgFormat = config.default_message_format ?? config.defaultMessageFormat;
        if (msgFormat !== undefined) updatePayload.default_message_format = msgFormat;

        const grpFreq = config.group_ai_response_frequency ?? config.groupAiResponseFrequency;
        if (grpFreq !== undefined) updatePayload.group_ai_response_frequency = grpFreq;

        const aiProv = config.ai_provider ?? config.aiProvider;
        if (aiProv !== undefined) updatePayload.ai_provider = aiProv;

        const aiMod = config.ai_model ?? config.aiModel;
        if (aiMod !== undefined) updatePayload.ai_model = aiMod;

        const aiKey = config.ai_api_key ?? config.aiApiKey;
        if (aiKey !== undefined) updatePayload.ai_api_key = aiKey;

        const sysPrompt = config.group_ai_system_prompt ?? config.groupAiSystemPrompt;
        if (sysPrompt !== undefined) updatePayload.group_ai_system_prompt = sysPrompt;

        const { data, error } = await supabase
          .from("whatsapp_state_config")
          .upsert(updatePayload, { onConflict: "state_id" })
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 2. Get State Configuration
      case "getConfig": {
        const { stateId } = body;
        if (!stateId) throw new Error("stateId is required");

        const { data, error } = await supabase
          .from("whatsapp_state_config")
          .select("*")
          .eq("state_id", stateId)
          .maybeSingle();

        if (error) throw error;
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 3. Create Instance via Partner API
      case "createInstance": {
        const { stateId, type = "agent", name } = body;
        if (!stateId) throw new Error("stateId is required");

        const { data: config } = await supabase
          .from("whatsapp_state_config")
          .select("green_api_partner_token")
          .eq("state_id", stateId)
          .single();

        if (!config?.green_api_partner_token) {
          throw new Error("Green API Partner Token not configured for this state");
        }

        const partnerToken = config.green_api_partner_token.trim();
        const webhookUrl = type === "group_monitor"
          ? `${supabaseUrl}/functions/v1/whatsapp-group-webhook`
          : `${supabaseUrl}/functions/v1/whatsapp-webhook`;

        const instanceName = name || `State_${stateId}_${type === "group_monitor" ? "GroupMon" : "Agent"}_${Date.now().toString().slice(-4)}`;

        const createRes = await fetch(`https://api.green-api.com/partner/createInstance/${partnerToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: instanceName,
            webhookUrl,
            delaySendMessagesMilliseconds: 3000,
            markIncomingMessagesReaded: "no",
            incomingWebhook: "yes",
            outgoingWebhook: "yes",
            outgoingMessageWebhook: "yes",
            outgoingAPIMessageWebhook: "yes",
            stateWebhook: "yes"
          })
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Green API error: ${createRes.status} - ${errText}`);
        }

        const resData = await createRes.json();
        const idInstance = resData.idInstance;
        const apiTokenInstance = resData.apiTokenInstance;
        const apiUrl = resData.apiUrl || "https://api.green-api.com/";

        const { data: inserted, error: insErr } = await supabase
          .from("whatsapp_instances")
          .insert({
            id_instance: idInstance,
            api_token_instance: apiTokenInstance,
            api_url: apiUrl,
            state_id: stateId,
            instance_type: type,
            pool_status: type === "group_monitor" ? "assigned" : "standby",
            wa_state: "notAuthorized",
            name: instanceName,
            webhook_type: type === "group_monitor" ? "group" : "agent"
          })
          .select()
          .single();

        if (insErr) throw insErr;

        return new Response(JSON.stringify({ success: true, instance: inserted }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 4. Get QR Code for an Instance
      case "getQRCode": {
        const { instanceId } = body;
        if (!instanceId) throw new Error("instanceId is required");

        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("id", instanceId)
          .single();

        if (!inst) throw new Error("Instance not found");

        const qrRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/qr/${inst.api_token_instance}`);
        const qrData = await qrRes.json();

        return new Response(JSON.stringify({ success: true, qr: qrData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 5. Get Phone Pairing Code
      case "getAuthCode": {
        const { instanceId, phoneNumber } = body;
        if (!instanceId || !phoneNumber) throw new Error("instanceId and phoneNumber are required");

        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("id", instanceId)
          .single();

        if (!inst) throw new Error("Instance not found");

        // Format phone: digits only, no + or 00
        let cleanPhone = String(phoneNumber).replace(/\D/g, "");
        if (cleanPhone.startsWith("0")) {
          cleanPhone = "234" + cleanPhone.substring(1);
        } else if (!cleanPhone.startsWith("234") && cleanPhone.length === 10) {
          cleanPhone = "234" + cleanPhone;
        }

        const codeRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/getAuthorizationCode/${inst.api_token_instance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: parseInt(cleanPhone, 10) })
        });

        const codeData = await codeRes.json();
        return new Response(JSON.stringify({ success: true, data: codeData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 6. Check Instance State
      case "checkInstanceState": {
        const { instanceId } = body;
        if (!instanceId) throw new Error("instanceId is required");

        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("id", instanceId)
          .single();

        if (!inst) throw new Error("Instance not found");

        const stateRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/getStateInstance/${inst.api_token_instance}`);
        const stateData = await stateRes.json();
        const waState = stateData.stateInstance || "notAuthorized";

        let phoneNumber = inst.phone_number;

        if (waState === "authorized" && !phoneNumber) {
          // Fetch linked phone number
          const settingsRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/getWaSettings/${inst.api_token_instance}`);
          if (settingsRes.ok) {
            const waSet = await settingsRes.json();
            phoneNumber = waSet.phone || waSet.wid?.split("@")[0] || null;
          }
        }

        await supabase
          .from("whatsapp_instances")
          .update({
            wa_state: waState,
            phone_number: phoneNumber,
            updated_at: new Date().toISOString()
          })
          .eq("id", instanceId);

        return new Response(JSON.stringify({ success: true, waState, phoneNumber }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 7. Assign Instance to Agent
      case "assignInstance": {
        const { instanceId, agentId } = body;
        if (!instanceId || !agentId) throw new Error("instanceId and agentId required");

        const { data: updated, error } = await supabase
          .from("whatsapp_instances")
          .update({
            assigned_agent_id: agentId,
            pool_status: "assigned",
            updated_at: new Date().toISOString()
          })
          .eq("id", instanceId)
          .select()
          .single();

        if (error) throw error;

        // Check if standby pool needs replenishment
        const stateId = updated.state_id;
        const { count } = await supabase
          .from("whatsapp_instances")
          .select("id", { count: "exact", head: true })
          .eq("state_id", stateId)
          .eq("instance_type", "agent")
          .eq("pool_status", "standby");

        let autoCreatedInstance = null;
        // If no agent instance is left in standby, automatically provision a new instance for the pool
        if ((count ?? 0) === 0) {
          try {
            const { data: cfg } = await supabase
              .from("whatsapp_state_config")
              .select("green_api_partner_token")
              .eq("state_id", stateId)
              .single();

            if (cfg?.green_api_partner_token) {
              const partnerToken = cfg.green_api_partner_token.trim();
              const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
              const instanceName = `State_${stateId}_Agent_${Date.now().toString().slice(-4)}`;

              const createRes = await fetch(`https://api.green-api.com/partner/createInstance/${partnerToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: instanceName,
                  webhookUrl,
                  delaySendMessagesMilliseconds: 3000,
                  markIncomingMessagesReaded: "no",
                  incomingWebhook: "yes",
                  outgoingWebhook: "yes",
                  outgoingMessageWebhook: "yes",
                  outgoingAPIMessageWebhook: "yes",
                  stateWebhook: "yes"
                })
              });

              if (createRes.ok) {
                const resData = await createRes.json();
                const { data: newInst } = await supabase
                  .from("whatsapp_instances")
                  .insert({
                    id_instance: resData.idInstance,
                    api_token_instance: resData.apiTokenInstance,
                    api_url: resData.apiUrl || "https://api.green-api.com/",
                    state_id: stateId,
                    instance_type: "agent",
                    pool_status: "standby",
                    wa_state: "notAuthorized",
                    name: instanceName,
                    webhook_type: "agent"
                  })
                  .select()
                  .single();
                autoCreatedInstance = newInst;
              }
            }
          } catch (autoErr) {
            console.error("Auto-provisioning pool instance error:", autoErr);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          instance: updated,
          standbyCount: autoCreatedInstance ? 1 : (count ?? 0),
          autoCreatedInstance,
          needsReplenishment: (count ?? 0) < 2
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 8. Logout / Disconnect Instance from Green API & DB
      case "logoutInstance": {
        const { instanceId } = body;
        if (!instanceId) throw new Error("instanceId is required");

        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("id", instanceId)
          .single();

        if (!inst) throw new Error("Instance not found");

        let logoutSuccess = false;
        let logoutData = null;

        if (inst.id_instance && inst.api_token_instance) {
          const baseUrl = (inst.api_url || "https://api.green-api.com").replace(/\/+$/, "");
          const logoutUrl = `${baseUrl}/waInstance${inst.id_instance}/logout/${inst.api_token_instance}`;

          try {
            const logoutRes = await fetch(logoutUrl, {
              method: "GET"
            });
            if (logoutRes.ok) {
              logoutData = await logoutRes.json().catch(() => ({}));
              logoutSuccess = logoutData?.isLogout ?? true;
            } else {
              const errText = await logoutRes.text().catch(() => "");
              console.warn(`Green API logout failed with status ${logoutRes.status}: ${errText}`);
            }
          } catch (e) {
            console.warn("Green API logout request error:", e);
          }
        }

        // Clear instance state in DB so it returns to standby / unassigned
        const { data: updated, error: updateErr } = await supabase
          .from("whatsapp_instances")
          .update({
            assigned_agent_id: null,
            pool_status: "standby",
            wa_state: "notAuthorized",
            phone_number: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", instanceId)
          .select()
          .single();

        if (updateErr) throw updateErr;

        return new Response(JSON.stringify({
          success: true,
          isLogout: logoutSuccess,
          logoutData,
          instance: updated
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 9. Send Flyer to Voter (Manual or Immediate)
      case "sendFlyer": {
        const { agentId, voterPhone, voterName, voterId, customMessage } = body;
        if (!agentId || !voterPhone) throw new Error("agentId and voterPhone are required");

        // 1. Get agent's assigned authorized instance
        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("assigned_agent_id", agentId)
          .eq("wa_state", "authorized")
          .single();

        if (!inst) throw new Error("Agent does not have an active, authorized WhatsApp instance");

        // 2. Get State Config for flyer and templates
        const { data: config } = await supabase
          .from("whatsapp_state_config")
          .select("*")
          .eq("state_id", inst.state_id)
          .single();

        // 3. Format voter phone
        let cleanPhone = String(voterPhone).replace(/\D/g, "");
        if (cleanPhone.startsWith("0")) {
          cleanPhone = "234" + cleanPhone.substring(1);
        } else if (!cleanPhone.startsWith("234") && cleanPhone.length === 10) {
          cleanPhone = "234" + cleanPhone;
        }
        const chatId = `${cleanPhone}@c.us`;

        // 4. Verify number on WhatsApp via checkWhatsapp
        let isNotOnWa = false;
        try {
          const baseUrl = (inst.api_url || "https://api.green-api.com").replace(/\/+$/, "");
          const checkRes = await fetch(`${baseUrl}/waInstance${inst.id_instance}/checkWhatsapp/${inst.api_token_instance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phoneNumber: parseInt(cleanPhone, 10) })
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json().catch(() => null);
            // Strictly check if Green API explicitly told us the number is NOT on WhatsApp
            if (checkData && checkData.existsWhatsapp === false) {
              isNotOnWa = true;
            }
          }
        } catch (chkErr) {
          console.warn("checkWhatsapp API error, will attempt send anyway:", chkErr);
        }

        if (isNotOnWa) {
          // Double check if conversation already exists in DB before rejecting
          const { data: prevConv } = await supabase
            .from("whatsapp_conversations")
            .select("id")
            .eq("chat_id", chatId)
            .maybeSingle();

          if (!prevConv) {
            // Log not on WhatsApp safely
            try {
              const numericVoterId = voterId ? parseInt(String(voterId).replace(/\D/g, ''), 10) : null;
              await supabase.from("whatsapp_outreach_queue").insert({
                agent_id: agentId,
                instance_id: inst.id,
                voter_id: Number.isFinite(numericVoterId) ? numericVoterId : null,
                voter_phone: cleanPhone,
                voter_name: voterName,
                scheduled_at: new Date().toISOString(),
                sent_at: new Date().toISOString(),
                status: "not_on_whatsapp",
                is_manual: true
              });
            } catch (queueErr) {
              console.warn("Outreach queue insert error:", queueErr);
            }

            return new Response(JSON.stringify({
              success: false,
              notOnWhatsapp: true,
              message: "Phone number is not registered on WhatsApp"
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }

        // 5. Build personalized message caption
        const { data: agent } = await supabase.from("agents").select("name, phone, wards_id").eq("id", agentId).single();
        let caption = customMessage;
        if (!caption && config?.default_message_template) {
          caption = config.default_message_template
            .replace(/\{\{voter_name\}\}/g, voterName || "Voter")
            .replace(/\{\{agent_name\}\}/g, agent?.name || "Field Agent")
            .replace(/\{\{ward_name\}\}/g, "your Ward");
        }
        caption = caption || `Hello ${voterName || ""}, this is from the ADC EagleEye team.`;

        let sendResult;
        let messageId = "";

        const baseUrl = (inst.api_url || "https://api.green-api.com").replace(/\/+$/, "");

        if (config?.default_flyer_url) {
          // Send Media (Image or Video) with caption via sendFileByUrl
          const fileName = config.default_flyer_type === "video" ? "adc_flyer.mp4" : "adc_flyer.jpg";
          const mediaRes = await fetch(`${baseUrl}/waInstance${inst.id_instance}/sendFileByUrl/${inst.api_token_instance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId,
              urlFile: config.default_flyer_url,
              fileName,
              caption
            })
          });
          sendResult = await mediaRes.json();
          messageId = sendResult.idMessage || "";
        } else {
          // Send plain text
          const textRes = await fetch(`${baseUrl}/waInstance${inst.id_instance}/sendMessage/${inst.api_token_instance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId, message: caption })
          });
          sendResult = await textRes.json();
          messageId = sendResult.idMessage || "";
        }

        // 6. Record Conversation & Message in DB
        const { data: conv } = await supabase
          .from("whatsapp_conversations")
          .upsert({
            agent_id: agentId,
            instance_id: inst.id,
            voter_phone: cleanPhone,
            voter_name: voterName,
            voter_id: voterId ? (parseInt(String(voterId).replace(/\D/g, ''), 10) || null) : null,
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

        // 7. Credit Agent Chat Earning
        const earningAmount = Number(config?.earning_per_chat || 50);
        if (earningAmount > 0) {
          try {
            const { data: ag } = await supabase.from("agents").select("whatsapp_earnings_balance").eq("id", agentId).single();
            const newBal = Number(ag?.whatsapp_earnings_balance || 0) + earningAmount;
            await supabase.from("agents").update({ whatsapp_earnings_balance: newBal }).eq("id", agentId);
          } catch (earnErr) {
            console.error("Agent earning update error:", earnErr);
          }
        }

        // 8. Log outreach queue
        try {
          const numericVoterId = voterId ? parseInt(String(voterId).replace(/\D/g, ''), 10) : null;
          await supabase.from("whatsapp_outreach_queue").insert({
            agent_id: agentId,
            instance_id: inst.id,
            voter_id: Number.isFinite(numericVoterId) ? numericVoterId : null,
            voter_phone: cleanPhone,
            voter_name: voterName,
            scheduled_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            status: "sent",
            message_id: messageId,
            is_manual: true
          });
        } catch (queueErr) {
          console.error("Log outreach queue error:", queueErr);
        }

        return new Response(JSON.stringify({
          success: true,
          messageId,
          earned: earningAmount,
          sendResult
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 9. Knowledge Base Upload & Vector Embedding
      case "uploadKnowledge": {
        const { stateId, title, content, contentType = "manifesto", imageUrl, imageCaption } = body;
        if (!stateId || !title || !content) throw new Error("stateId, title, and content are required");

        // Retrieve AI config
        const { data: config } = await supabase
          .from("whatsapp_state_config")
          .select("ai_provider, ai_model, ai_api_key")
          .eq("state_id", stateId)
          .single();

        const provider = config?.ai_provider || "gemini";
        const apiKey = config?.ai_api_key || Deno.env.get("VITE_GOOGLE_AI_KEY") || Deno.env.get("GEMINI_API_KEY") || "";

        let embedding: number[] | null = null;

        // Generate embedding if Gemini or OpenAI key available
        if (apiKey) {
          try {
            if (provider === "gemini") {
              const embRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "models/text-embedding-004",
                  content: { parts: [{ text: `${title}\n${content}` }] }
                })
              });
              if (embRes.ok) {
                const embData = await embRes.json();
                embedding = embData.embedding?.values || null;
              }
            } else if (provider === "openai") {
              const embRes = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                  model: "text-embedding-3-small",
                  input: `${title}\n${content}`,
                  dimensions: 768
                })
              });
              if (embRes.ok) {
                const embData = await embRes.json();
                embedding = embData.data?.[0]?.embedding || null;
              }
            }
          } catch (e) {
            console.error("Failed to generate embedding, storing text without vector:", e);
          }
        }

        const { data: kbItem, error: kbErr } = await supabase
          .from("whatsapp_knowledge_base")
          .insert({
            state_id: stateId,
            title,
            content,
            content_type: contentType,
            image_url: imageUrl || null,
            image_caption: imageCaption || null,
            embedding: embedding ? JSON.stringify(embedding) : null
          })
          .select()
          .single();

        if (kbErr) throw kbErr;

        return new Response(JSON.stringify({ success: true, item: kbItem }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 10. Pool Replenishment check
      case "replenishPool": {
        const { stateId } = body;
        if (!stateId) throw new Error("stateId required");

        const { count } = await supabase
          .from("whatsapp_instances")
          .select("id", { count: "exact", head: true })
          .eq("state_id", stateId)
          .eq("instance_type", "agent")
          .eq("pool_status", "standby");

        const needed = Math.max(0, 2 - (count ?? 0));
        return new Response(JSON.stringify({ success: true, currentStandby: count, needed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 11. Get Group Data from Green API
      case "getGroupData": {
        const { instanceId, groupId } = body;
        if (!instanceId || !groupId) throw new Error("instanceId and groupId required");

        const { data: inst } = await supabase.from("whatsapp_instances").select("*").eq("id", instanceId).single();
        if (!inst) throw new Error("Instance not found");

        const grpRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/getGroupData/${inst.api_token_instance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId })
        });
        const grpData = await grpRes.json();

        return new Response(JSON.stringify({ success: true, groupData: grpData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 12. Credit Call or Manual Outreach Earning
      case "creditOutreachEarning": {
        const { agentId, type, voterId, voterPhone, voterName } = body;
        if (!agentId) throw new Error("agentId is required");

        const { data: agent } = await supabase.from("agents").select("state_id, whatsapp_earnings_balance").eq("id", agentId).single();
        const stateId = agent?.state_id || 24;

        const { data: config } = await supabase.from("whatsapp_state_config").select("*").eq("state_id", stateId).single();

        const amount = type === "call" 
          ? Number(config?.earning_per_call ?? 20)
          : Number(config?.earning_per_manual_wa ?? 15);

        if (amount > 0) {
          const newBal = Number(agent?.whatsapp_earnings_balance || 0) + amount;
          await supabase.from("agents").update({ whatsapp_earnings_balance: newBal }).eq("id", agentId);
        }

        if (voterPhone) {
          await supabase.from("whatsapp_outreach_queue").insert({
            agent_id: agentId,
            voter_id: voterId || null,
            voter_phone: voterPhone,
            voter_name: voterName || null,
            scheduled_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            status: type === "call" ? "called" : "wa_link_opened",
            is_manual: true
          });
        }

        return new Response(JSON.stringify({ success: true, earned: amount }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
