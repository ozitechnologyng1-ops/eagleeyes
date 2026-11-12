import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authorizeAgentRequest } from "../_shared/agent-session.ts";
import { createAnalyzeResultHandler } from "./handler.ts";

Deno.serve(
  createAnalyzeResultHandler(
    authorizeAgentRequest,
    () => Deno.env.get("OPENAI"),
    fetch,
    () => Deno.env.get("GROQ_API_KEY"),
    () => Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GOOGLE_AI_KEY"),
  ),
);
