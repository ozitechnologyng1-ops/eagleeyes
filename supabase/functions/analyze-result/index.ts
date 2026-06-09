import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Fix VS Code TS error showing "Cannot find name 'Deno'"
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, promptText, mimeType = "image/jpeg" } = await req.json();

    if (!imageBase64 || !promptText) {
      throw new Error("Missing imageBase64  ");
    }

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('VITE_GOOGLE_AI_KEY') || Deno.env.get('GEMINI_API_KEY');

    // Fetch configuration with 45-second timeout to allow huge images without dropping connection
    const fetchWithTimeout = async (url: string, options: any, timeoutMs = 45000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (err: any) {
        clearTimeout(id);
        throw new Error(err.name === 'AbortError' ? 'API Request Timed Out' : err.message);
      }
    };

    // Helper to call Groq (groq.com)
    async function callGroq(modelName: string) {
      console.log(`Attempting Groq parsing with ${modelName}...`);
      const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
      const groqBody = {
        model: modelName,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
          ]
        }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      };

      const groqRes = await fetchWithTimeout(groqUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify(groqBody)
      });

      if (!groqRes.ok) throw new Error(`Status ${groqRes.status}: ${await groqRes.text()}`);
      
      const groqData = await groqRes.json();
      const textResponse = groqData.choices?.[0]?.message?.content;
      if (!textResponse) throw new Error("Groq returned empty content.");
      
      return JSON.parse(textResponse);
    }

    // Helper to call Gemini
    async function callGemini(modelName: string) {
      console.log(`Attempting Gemini parsing with ${modelName}...`);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
      const geminiBody = {
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: mimeType, data: imageBase64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      };

      const geminiRes = await fetchWithTimeout(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody)
      });

      if (!geminiRes.ok) throw new Error(`Status ${geminiRes.ok ? 200 : geminiRes.status}: ${await geminiRes.text()}`);
      
      const geminiData = await geminiRes.json();
      const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error("Gemini returned empty candidates.");
      
      return JSON.parse(textResponse);
    }

    let resultJson = null;
    let errors = [];
    let aiUsed = null;

    // 1. Try Groq Llama 4 Scout (Natively Multimodal MoE - April 2026 Primary)
    if (GROQ_API_KEY && !resultJson) {
      try {
        resultJson = await callGroq("meta-llama/llama-4-scout-17b-16e-instruct");
        aiUsed = "llama-4-scout";
      } catch (err: any) {
        errors.push(`groq-llama-4: ${err.message}`);
      }
    }

    // 2. Try Gemini 3.1 Flash-Lite
    if (GEMINI_API_KEY && !resultJson) {
      try {
        resultJson = await callGemini("gemini-3.1-flash-lite-preview");
        aiUsed = "gemini-3.1-flash-lite";
      } catch (err: any) {
        errors.push(`gemini-3.1-flash: ${err.message}`);
      }
    }

    // 3. Try Gemini 2.5 Flash
    if (GEMINI_API_KEY && !resultJson) {
      try {
        resultJson = await callGemini("gemini-2.5-flash");
        aiUsed = "gemini-2.5-flash";
      } catch (err: any) {
        errors.push(`gemini-2.5-flash: ${err.message}`);
      }
    }

    if (!resultJson) {
      throw new Error(`Vision models failed across the board. Exact trace: ${errors.join(" || ")}`);
    }

    return new Response(
      JSON.stringify({ results: resultJson, ai_used: aiUsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error: any) {
    console.error("Edge Function Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }
})
