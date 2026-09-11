import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Helper for extracting JSON safely from AI output
function parseJsonSafe(rawText: string): any {
  if (!rawText) return {};
  try {
    return JSON.parse(rawText.trim());
  } catch (_) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e) {
        console.warn("Regex JSON parse failed:", e);
      }
    }
    return {};
  }
}

// Multi-provider AI text generator supporting Groq, OpenAI, and Gemini
async function generateAiText({
  provider,
  model,
  apiKey,
  systemPrompt,
  userPrompt,
  jsonMode = false
}: {
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  jsonMode?: boolean;
}): Promise<string> {
  const prov = (provider || "gemini").toLowerCase().trim();
  const cleanKey = apiKey.trim();

  if (prov === "groq" || prov === "openai") {
    const url = prov === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    const chosenModel = model || (prov === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

    const body: any = {
      model: chosenModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3
    };

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cleanKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${prov.toUpperCase()} API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } else {
    // Default to Google Gemini
    const chosenModel = model || "gemini-2.0-flash";
    const body: any = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ]
    };
    if (jsonMode) {
      body.generationConfig = { responseMimeType: "application/json" };
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${cleanKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json().catch(() => ({}));

    const { typeWebhook, instanceData, senderData, messageData, idMessage } = body;
    const idInstance = instanceData?.idInstance;

    if (!idInstance) {
      return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Lookup instance in DB
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("id_instance", idInstance)
      .single();

    if (!inst) {
      return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
    }

    const stateId = inst.state_id;

    // Fetch state config
    const { data: stateCfg } = await supabase
      .from("whatsapp_state_config")
      .select("*")
      .eq("state_id", stateId)
      .single();

    const chatId = senderData?.chatId || "";

    // Process only Group Chats (@g.us)
    if (chatId.endsWith("@g.us")) {
      const groupName = senderData?.chatName || "WhatsApp Group";
      const senderPhone = senderData?.sender?.split("@")[0] || "";
      const senderName = senderData?.senderName || "Participant";

      // 1. Find or create group monitor record
      let { data: monitor } = await supabase
        .from("whatsapp_group_monitors")
        .select("*")
        .eq("state_id", stateId)
        .eq("group_chat_id", chatId)
        .maybeSingle();

      let participantCount = 0;
      let rawParticipants: any[] = [];

      // Query Green API getGroupData once to extract participants and count
      try {
        const grpRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/getGroupData/${inst.api_token_instance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId: chatId })
        });

        if (grpRes.ok) {
          const grpData = await grpRes.json();
          if (Array.isArray(grpData.participants)) {
            rawParticipants = grpData.participants;
            participantCount = grpData.participants.length;
          }
        }
      } catch (grpErr) {
        console.error("Failed to query group data:", grpErr);
      }

      if (!monitor) {
        let addedByAgentId: string | null = null;

        if (rawParticipants.length > 0) {
          const participants = rawParticipants.map((p: any) => String(p.id).split("@")[0]);

          const { data: matchedAgents } = await supabase
            .from("agents")
            .select("id, name, phone")
            .eq("state_id", stateId);

          if (matchedAgents && matchedAgents.length > 0) {
            for (const ag of matchedAgents) {
              const cleanAgPhone = ag.phone.replace(/\D/g, "").slice(-10);
              if (participants.some((p: string) => p.includes(cleanAgPhone))) {
                addedByAgentId = ag.id;
                break;
              }
            }
          }
        }

        const { data: newMon } = await supabase
          .from("whatsapp_group_monitors")
          .insert({
            state_id: stateId,
            instance_id: inst.id,
            group_chat_id: chatId,
            group_name: groupName,
            added_by_agent_id: addedByAgentId,
            participant_count: participantCount,
            status: "active",
            ai_enabled: true,
            last_message_at: new Date().toISOString()
          })
          .select()
          .single();

        monitor = newMon;

        // Credit agent for adding the group monitor number
        if (addedByAgentId) {
          const groupEarning = Number(stateCfg?.earning_per_group_add || 100);
          if (groupEarning > 0) {
            const { data: ag } = await supabase.from("agents").select("whatsapp_earnings_balance").eq("id", addedByAgentId).single();
            const newBal = Number(ag?.whatsapp_earnings_balance || 0) + groupEarning;
            await supabase.from("agents").update({ whatsapp_earnings_balance: newBal }).eq("id", addedByAgentId);
          }
        }
      } else {
        // Update last message timestamp, name, and refresh participant count if we got one
        const updatePayload: any = {
          last_message_at: new Date().toISOString(),
          group_name: groupName || monitor.group_name
        };
        if (participantCount > 0) {
          updatePayload.participant_count = participantCount;
        }

        await supabase
          .from("whatsapp_group_monitors")
          .update(updatePayload)
          .eq("id", monitor.id);
      }

      // 2. Extract Message Content
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

      if (monitor && text) {
        const apiKey = stateCfg?.ai_api_key || Deno.env.get("GROQ_API_KEY") || Deno.env.get("VITE_GOOGLE_AI_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
        const aiProvider = stateCfg?.ai_provider || "groq";
        const aiModel = stateCfg?.ai_model || (aiProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-2.0-flash");

        let aiCategory = "neutral";
        let aiSummary = "";
        let shouldRespond = false;
        let aiReplyText = "";

        const responseFreq = Number(stateCfg?.group_ai_response_frequency ?? 3);

        if (apiKey && text.trim().length > 3) {
          try {
            // Step A: Categorize group message
            const catPrompt = `Categorize this political WhatsApp group chat message:
"${text}"

Categories:
- "attack": direct attack, misinformation, opponent smear, or hostile accusation against the candidate or party
- "negative": general criticism or dissatisfaction with governance or policies
- "question": inquiry asking about the candidate's manifesto, credentials, policy, or promises
- "positive": expression of support or encouragement for the candidate/party
- "neutral": general chatter, greeting, or unrelated topic

You must respond with valid JSON only in this schema:
{
  "category": "positive" | "negative" | "attack" | "question" | "neutral",
  "summary": "one line summary",
  "requiresDefense": boolean
}`;

            const catResult = await generateAiText({
              provider: aiProvider,
              model: aiModel,
              apiKey,
              systemPrompt: "You are an AI political analyst monitoring community group discussions. Always output strictly valid JSON.",
              userPrompt: catPrompt,
              jsonMode: true
            });

            const parsed = parseJsonSafe(catResult);
            aiCategory = parsed.category || "neutral";
            aiSummary = parsed.summary || "";
            const requiresDefense = Boolean(parsed.requiresDefense || aiCategory === "attack" || aiCategory === "question");

            console.log(`Classified message: category="${aiCategory}", requiresDefense=${requiresDefense}, ai_enabled=${monitor.ai_enabled}`);

            // Step B: If requires defense AND frequency > 0 AND monitor.ai_enabled
            if (responseFreq > 0 && monitor.ai_enabled && requiresDefense) {
              if ((monitor.ai_responses_today || 0) < responseFreq * 12) {
                // Retrieve Candidate Knowledge Context
                let contextText = "";

                // Attempt vector embedding if Gemini key is active
                if (aiProvider === "gemini") {
                  try {
                    const embRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        model: "models/text-embedding-004",
                        content: { parts: [{ text: text }] }
                      })
                    });

                    if (embRes.ok) {
                      const embData = await embRes.json();
                      const queryVec = embData.embedding?.values;
                      if (queryVec) {
                        const { data: matched } = await supabase.rpc("match_knowledge_base", {
                          p_state_id: stateId,
                          p_query_embedding: JSON.stringify(queryVec),
                          p_match_count: 3,
                          p_match_threshold: 0.5
                        });
                        if (matched && matched.length > 0) {
                          contextText = matched.map((m: any) => `[${m.title}]: ${m.content}`).join("\n\n");
                        }
                      }
                    }
                  } catch (vErr) {
                    console.warn("Vector search error (falling back to direct KB):", vErr);
                  }
                }

                // Fallback / direct knowledge retrieval for Groq / OpenAI or when vector matches are empty
                if (!contextText) {
                  const { data: directKbs } = await supabase
                    .from("whatsapp_knowledge_base")
                    .select("title, content")
                    .eq("state_id", stateId)
                    .limit(5);

                  if (directKbs && directKbs.length > 0) {
                    contextText = directKbs.map((k: any) => `[${k.title}]: ${k.content}`).join("\n\n");
                  }
                }

                // Generate defense response using candidate knowledge
                const systemPrompt = stateCfg?.group_ai_system_prompt || "You are an articulate, respectful community representative defending the ADC candidate factually and peacefully.";
                const respPrompt = `Verified Candidate Manifesto & Knowledge:
${contextText || "ADC Core Commitments: Grassroots welfare, infrastructure transparency, healthcare revitalization, and youth enterprise support."}

A participant in the WhatsApp group stated:
"${text}"

Write a concise, friendly, factual defense or answer (maximum 2-3 sentences). Sound like an articulate, respectful grassroots community member.`;

                aiReplyText = await generateAiText({
                  provider: aiProvider,
                  model: aiModel,
                  apiKey,
                  systemPrompt,
                  userPrompt: respPrompt,
                  jsonMode: false
                });

                if (aiReplyText) {
                  shouldRespond = true;

                  // Send response to WhatsApp Group via Green API
                  const sendRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/sendMessage/${inst.api_token_instance}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      chatId,
                      message: aiReplyText,
                      quotedMessageId: idMessage
                    })
                  });

                  console.log(`Dispatched AI reply to group ${chatId}, status=${sendRes.status}`);

                  // Increment today's AI responses
                  await supabase
                    .from("whatsapp_group_monitors")
                    .update({ ai_responses_today: (monitor.ai_responses_today || 0) + 1 })
                    .eq("id", monitor.id);
                }
              } else {
                console.log("Daily response limit reached for group", chatId);
              }
            }
          } catch (aiErr) {
            console.error("AI group processing error:", aiErr);
          }
        }

        // 3. Log group message
        await supabase.from("whatsapp_group_messages").insert({
          monitor_id: monitor.id,
          group_chat_id: chatId,
          sender_phone: senderPhone,
          sender_name: senderName,
          message_type: messageType,
          message_text: text,
          media_url: mediaUrl,
          ai_category: aiCategory,
          ai_summary: aiSummary,
          green_api_message_id: idMessage || null,
          ai_responded: shouldRespond,
          ai_response_text: aiReplyText || null
        });
      }
    }

    // Process Direct 1-on-1 Private Chats (@c.us) so users can chat with the AI directly
    if (chatId.endsWith("@c.us")) {
      let text = "";
      if (messageData?.typeMessage === "textMessage") {
        text = messageData.textMessageData?.textMessage || "";
      } else if (messageData?.typeMessage === "extendedTextMessage") {
        text = messageData.extendedTextMessageData?.text || "";
      } else if (messageData?.typeMessage === "imageMessage") {
        text = messageData.imageMessageData?.caption || "";
      }

      if (text.trim().length > 1) {
        const apiKey = stateCfg?.ai_api_key || Deno.env.get("GROQ_API_KEY") || Deno.env.get("VITE_GOOGLE_AI_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
        const aiProvider = stateCfg?.ai_provider || "groq";
        const aiModel = stateCfg?.ai_model || (aiProvider === "groq" ? "llama-3.3-70b-versatile" : "gemini-2.0-flash");

        if (apiKey) {
          try {
            // Retrieve candidate knowledge
            let contextText = "";
            const { data: directKbs } = await supabase
              .from("whatsapp_knowledge_base")
              .select("title, content")
              .eq("state_id", stateId)
              .limit(6);

            if (directKbs && directKbs.length > 0) {
              contextText = directKbs.map((k: any) => `[${k.title}]: ${k.content}`).join("\n\n");
            }

            const systemPrompt = stateCfg?.group_ai_system_prompt || "You are an articulate, respectful, and knowledgeable representative answering questions about the candidate and party.";
            const userPrompt = `Verified Candidate Knowledge & Policies:
${contextText || "ADC Core Commitments: Grassroots welfare, infrastructure transparency, healthcare revitalization, and youth enterprise support."}

A voter sent this direct WhatsApp message:
"${text}"

Write a direct, helpful, polite, and encouraging answer (maximum 2-3 sentences). Answer their inquiry accurately using the verified knowledge above.`;

            const replyText = await generateAiText({
              provider: aiProvider,
              model: aiModel,
              apiKey,
              systemPrompt,
              userPrompt,
              jsonMode: false
            });

            if (replyText) {
              const directSendRes = await fetch(`${inst.api_url}waInstance${inst.id_instance}/sendMessage/${inst.api_token_instance}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chatId,
                  message: replyText,
                  quotedMessageId: idMessage
                })
              });
              console.log(`Dispatched direct 1-on-1 AI reply to ${chatId}, status=${directSendRes.status}`);
            }
          } catch (directAiErr) {
            console.error("Direct 1-on-1 chat AI error:", directAiErr);
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("Group webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
