import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-id, x-agent-phone",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Helper: Intelligent semantic text chunker (breaks into ~600-800 char chunks with overlap)
function chunkText(text: string, maxChunkSize = 750, overlap = 150): string[] {
  const clean = text.trim();
  if (clean.length <= maxChunkSize) return [clean];

  // Try splitting by double newline (paragraphs) first
  const paragraphs = clean.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    if (currentChunk.length + trimmedPara.length + 2 <= maxChunkSize) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${trimmedPara}` : trimmedPara;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If a single paragraph is larger than maxChunkSize, split by sentence or length
      if (trimmedPara.length > maxChunkSize) {
        let remaining = trimmedPara;
        while (remaining.length > 0) {
          if (remaining.length <= maxChunkSize) {
            chunks.push(remaining);
            currentChunk = "";
            break;
          }
          // Find last period/newline within maxChunkSize
          let splitIdx = remaining.lastIndexOf(".", maxChunkSize);
          if (splitIdx < maxChunkSize * 0.4) {
            splitIdx = remaining.lastIndexOf(" ", maxChunkSize);
          }
          if (splitIdx === -1 || splitIdx < maxChunkSize * 0.3) {
            splitIdx = maxChunkSize;
          } else {
            splitIdx += 1;
          }
          chunks.push(remaining.substring(0, splitIdx).trim());
          const nextStart = Math.max(0, splitIdx - overlap);
          remaining = remaining.substring(nextStart).trim();
        }
      } else {
        currentChunk = trimmedPara;
      }
    }
  }

  if (currentChunk && !chunks.includes(currentChunk)) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [clean];
}

// Helper: Generate 768-dim vector embedding with Gemini or OpenAI
async function generateEmbedding(text: string, provider: string, apiKey: string): Promise<number[] | null> {
  if (!apiKey || !text) return null;
  try {
    if (provider === "openai") {
      const embRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text.slice(0, 8000),
          dimensions: 768
        })
      });
      if (embRes.ok) {
        const embData = await embRes.json();
        return embData.data?.[0]?.embedding || null;
      }
      const err = await embRes.text();
      console.warn("OpenAI embedding error:", err);
    } else {
      // Default to Gemini gemini-embedding-001 (768 dimensions)
      const embRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-2",
          content: { parts: [{ text: text.slice(0, 8000) }] },
          outputDimensionality: 768
        })
      });
      if (embRes.ok) {
        const embData = await embRes.json();
        return embData.embedding?.values || null;
      }
      const err = await embRes.text();
      console.warn("Gemini embedding error:", err);
    }
  } catch (e) {
    console.error("Embedding generation exception:", e);
  }
  return null;
}

// Helper: Vectorize and chunk an entry into the database
async function vectorizeAndStoreEntry(
  supabase: any,
  stateId: number,
  title: string,
  content: string,
  contentType: string,
  imageUrl?: string,
  imageCaption?: string,
  docUrl?: string,
  docName?: string,
  provider = "gemini",
  apiKey = ""
) {
  // 1. Create parent entry or chunk
  const chunks = chunkText(content);

  // Insert root / primary entry
  const firstEmbedding = await generateEmbedding(`${title}\n${chunks[0]}`, provider, apiKey);

  const { data: parentEntry, error: pErr } = await supabase
    .from("whatsapp_knowledge_base")
    .insert({
      state_id: stateId,
      title,
      content,  // Store full original content on root for UI display
      content_type: contentType,
      image_url: imageUrl || null,
      image_caption: imageCaption || null,
      doc_url: docUrl || null,
      doc_name: docName || null,
      embedding: firstEmbedding ?? null,
      chunk_index: 0,
      source_doc_id: null
    })
    .select()
    .single();

  if (pErr) throw pErr;

  // Insert subsequent chunks in background linked to parentEntry.id
  if (chunks.length > 1) {
    for (let i = 1; i < chunks.length; i++) {
      const chunkTextContent = chunks[i];
      const chunkEmb = await generateEmbedding(`${title} (Part ${i + 1})\n${chunkTextContent}`, provider, apiKey);
      await supabase.from("whatsapp_knowledge_base").insert({
        state_id: stateId,
        title: `${title} (Part ${i + 1})`,
        content: chunkTextContent,
        content_type: contentType,
        image_url: imageUrl || null,
        image_caption: imageCaption || null,
        doc_url: docUrl || null,
        doc_name: docName || null,
        embedding: chunkEmb ?? null,
        chunk_index: i,
        source_doc_id: parentEntry.id
      });
    }
  }

  return parentEntry;
}

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

        // If an API key is now active, check for unvectorized knowledge entries and auto-embed them in the background
        const finalApiKey = data.ai_api_key || Deno.env.get("VITE_GOOGLE_AI_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
        if (finalApiKey) {
          try {
            const { data: unEmbedded } = await supabase
              .from("whatsapp_knowledge_base")
              .select("id, title, content, content_type, image_url, image_caption, doc_url, doc_name")
              .eq("state_id", targetStateId)
              .is("embedding", null)
              .is("source_doc_id", null);

            if (unEmbedded && unEmbedded.length > 0) {
              // Vectorize un-embedded entries in background
              (async () => {
                for (const item of unEmbedded) {
                  try {
                    const chunks = chunkText(item.content);
                    const rootEmb = await generateEmbedding(`${item.title}\n${chunks[0]}`, data.ai_provider || "gemini", finalApiKey);
                    await supabase
                      .from("whatsapp_knowledge_base")
                      .update({
                        embedding: rootEmb ?? null,
                        chunk_index: 0
                      })
                      .eq("id", item.id);

                    if (chunks.length > 1) {
                      for (let i = 1; i < chunks.length; i++) {
                        const cEmb = await generateEmbedding(`${item.title} (Part ${i + 1})\n${chunks[i]}`, data.ai_provider || "gemini", finalApiKey);
                        await supabase.from("whatsapp_knowledge_base").insert({
                          state_id: targetStateId,
                          title: `${item.title} (Part ${i + 1})`,
                          content: chunks[i],
                          content_type: item.content_type || "manifesto",
                          image_url: item.image_url || null,
                          image_caption: item.image_caption || null,
                          doc_url: item.doc_url || null,
                          doc_name: item.doc_name || null,
                          embedding: cEmb ?? null,
                          chunk_index: i,
                          source_doc_id: item.id
                        });
                      }
                    }
                  } catch (itemErr) {
                    console.error("Auto background embedding item error:", itemErr);
                  }
                }
              })();
            }
          } catch (autoErr) {
            console.warn("Auto-reindex check warning:", autoErr);
          }
        }

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

      // 9. Knowledge Base Upload with Intelligent Background Chunking & Dual Vectorization
      case "uploadKnowledge": {
        const { stateId, title, content, contentType = "manifesto", imageUrl, imageCaption, docUrl, docName } = body;
        if (!stateId || !title || !content) throw new Error("stateId, title, and content are required");

        // Retrieve AI config
        const { data: config } = await supabase
          .from("whatsapp_state_config")
          .select("ai_provider, ai_model, ai_api_key")
          .eq("state_id", stateId)
          .single();

        const provider = config?.ai_provider || "gemini";
        const apiKey = config?.ai_api_key || Deno.env.get("VITE_GOOGLE_AI_KEY") || Deno.env.get("GEMINI_API_KEY") || "";

        const rootItem = await vectorizeAndStoreEntry(
          supabase,
          stateId,
          title,
          content,
          contentType,
          imageUrl,
          imageCaption,
          docUrl,
          docName,
          provider,
          apiKey
        );

        return new Response(JSON.stringify({ success: true, item: rootItem }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 9b. Update Knowledge Entry & Re-chunk/Re-embed
      case "updateKnowledge": {
        const { id, stateId, title, content, contentType = "manifesto", imageUrl, imageCaption, docUrl, docName } = body;
        if (!id || !title || !content) throw new Error("id, title, and content are required");

        // First find stateId if not supplied
        let targetStateId = stateId;
        if (!targetStateId) {
          const { data: existing } = await supabase.from("whatsapp_knowledge_base").select("state_id").eq("id", id).single();
          targetStateId = existing?.state_id;
        }

        // Delete all old child chunks belonging to this entry
        await supabase.from("whatsapp_knowledge_base").delete().eq("source_doc_id", id);

        // Retrieve AI config
        const { data: config } = await supabase
          .from("whatsapp_state_config")
          .select("ai_provider, ai_model, ai_api_key")
          .eq("state_id", targetStateId)
          .single();

        const provider = config?.ai_provider || "gemini";
        const apiKey = config?.ai_api_key || Deno.env.get("VITE_GOOGLE_AI_KEY") || Deno.env.get("GEMINI_API_KEY") || "";

        // Re-chunk new content
        const chunks = chunkText(content);
        const rootEmbedding = await generateEmbedding(`${title}\n${chunks[0]}`, provider, apiKey);

        // Update root entry
        const { data: updatedRoot, error: uErr } = await supabase
          .from("whatsapp_knowledge_base")
          .update({
            title,
            content,  // Store full original content on root for UI display
            content_type: contentType,
            image_url: imageUrl || null,
            image_caption: imageCaption || null,
            doc_url: docUrl || null,
            doc_name: docName || null,
            embedding: rootEmbedding ?? null,
            chunk_index: 0
          })
          .eq("id", id)
          .select()
          .single();

        if (uErr) throw uErr;

        // Insert new subsequent chunks if any
        if (chunks.length > 1) {
          for (let i = 1; i < chunks.length; i++) {
            const chunkContent = chunks[i];
            const chunkEmb = await generateEmbedding(`${title} (Part ${i + 1})\n${chunkContent}`, provider, apiKey);
            await supabase.from("whatsapp_knowledge_base").insert({
              state_id: targetStateId,
              title: `${title} (Part ${i + 1})`,
              content: chunkContent,
              content_type: contentType,
              image_url: imageUrl || null,
              image_caption: imageCaption || null,
              doc_url: docUrl || null,
              doc_name: docName || null,
              embedding: chunkEmb ?? null,
              chunk_index: i,
              source_doc_id: id
            });
          }
        }

        return new Response(JSON.stringify({ success: true, item: updatedRoot }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 9c. Delete Knowledge Entry & its Chunks
      case "deleteKnowledge": {
        const { id } = body;
        if (!id) throw new Error("id is required");

        // Delete all child chunks first
        await supabase.from("whatsapp_knowledge_base").delete().eq("source_doc_id", id);
        // Delete root
        const { error: dErr } = await supabase.from("whatsapp_knowledge_base").delete().eq("id", id);
        if (dErr) throw dErr;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 9d. Re-index / Vectorize All Knowledge Base Entries for State
      case "reindexKnowledge": {
        const { stateId } = body;
        if (!stateId) throw new Error("stateId is required");

        const { data: config } = await supabase
          .from("whatsapp_state_config")
          .select("ai_provider, ai_model, ai_api_key")
          .eq("state_id", stateId)
          .single();

        const provider = config?.ai_provider || "gemini";
        const apiKey = config?.ai_api_key || Deno.env.get("VITE_GOOGLE_AI_KEY") || Deno.env.get("GEMINI_API_KEY") || "";

        if (!apiKey) {
          throw new Error("No AI API key found for this state. Please save an API key first.");
        }

        // Fetch all root entries
        const { data: entries, error: fErr } = await supabase
          .from("whatsapp_knowledge_base")
          .select("*")
          .eq("state_id", stateId)
          .is("source_doc_id", null);

        if (fErr) throw fErr;

        let vectorizedCount = 0;
        let createdChunksCount = 0;

        for (const entry of entries || []) {
          // Check if entry needs chunking or embedding
          const chunks = chunkText(entry.content);

          // Embed root chunk
          const rootEmb = await generateEmbedding(`${entry.title}\n${chunks[0]}`, provider, apiKey);
          await supabase
            .from("whatsapp_knowledge_base")
            .update({
              embedding: rootEmb ?? null,
              chunk_index: 0
            })
            .eq("id", entry.id);

          vectorizedCount++;

          // Delete previous child chunks
          await supabase.from("whatsapp_knowledge_base").delete().eq("source_doc_id", entry.id);

          // Insert new child chunks
          if (chunks.length > 1) {
            for (let i = 1; i < chunks.length; i++) {
              const chunkContent = chunks[i];
              const cEmb = await generateEmbedding(`${entry.title} (Part ${i + 1})\n${chunkContent}`, provider, apiKey);
              await supabase.from("whatsapp_knowledge_base").insert({
                state_id: stateId,
                title: `${entry.title} (Part ${i + 1})`,
                content: chunkContent,
                content_type: entry.content_type || "manifesto",
                image_url: entry.image_url || null,
                image_caption: entry.image_caption || null,
                doc_url: entry.doc_url || null,
                doc_name: entry.doc_name || null,
                embedding: cEmb ?? null,
                chunk_index: i,
                source_doc_id: entry.id
              });
              createdChunksCount++;
            }
          }
        }

        return new Response(JSON.stringify({
          success: true,
          vectorizedCount,
          createdChunksCount,
          totalProcessed: (entries || []).length
        }), {
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

      // 17. Toggle Group AI Defense
      case "toggleGroupAi": {
        const { monitorId, enabled } = body;
        if (!monitorId) throw new Error("monitorId is required");
        const { data, error } = await supabase
          .from("whatsapp_group_monitors")
          .update({ ai_enabled: enabled })
          .eq("id", monitorId)
          .select()
          .single();
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 18. Bulk Toggle Group AI Defense
      case "bulkToggleGroupAi": {
        const { stateId: targetStateId, enabled, monitorIds } = body;
        let query = supabase.from("whatsapp_group_monitors").update({ ai_enabled: enabled });
        if (monitorIds && monitorIds.length > 0) {
          query = query.in("id", monitorIds);
        } else if (targetStateId) {
          query = query.eq("state_id", targetStateId);
        }
        const { error } = await query;
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
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

