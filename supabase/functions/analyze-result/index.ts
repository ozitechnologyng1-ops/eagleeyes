import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authorizeAgentRequest } from "../_shared/agent-session.ts";
import { createAnalyzeResultHandler } from "./handler.ts";
import { normalizeCe8aCode, validateCe8aAssignment } from "./form-identity.ts";

Deno.serve(
  createAnalyzeResultHandler(
    authorizeAgentRequest,
    () => Deno.env.get("OPENAI"),
    fetch,
    () => Deno.env.get("GROQ_API_KEY"),
    () => Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GOOGLE_AI_KEY"),
    async ({ session: { agent }, client, body }, result) => {
      if (agent.role !== "pu_agent") return null;
      const unavailable =
        "We couldn’t confirm your polling-unit assignment. Please try again or contact an admin.";
      if (!agent.polling_units_id) return unavailable;
      const { data: pu, error } = await client
        .from("polling_units")
        .select('"puId",pu_code,state_id,localgovernment_id,ward_id')
        .eq("id", agent.polling_units_id)
        .maybeSingle();
      const code = normalizeCe8aCode(pu?.puId) ?? normalizeCe8aCode(pu?.pu_code);
      if (error || !pu || !code || (agent.state_id && agent.state_id !== pu.state_id))
        return unavailable;
      const [state, lga, ward] = await Promise.all([
        client.from("states").select("name").eq("id", pu.state_id).maybeSingle(),
        client
          .from("local_governments")
          .select("name")
          .eq("id", pu.localgovernment_id)
          .maybeSingle(),
        client.from("wards").select("name").eq("id", pu.ward_id).maybeSingle(),
      ]);
      if (!state.data?.name || !lga.data?.name || !ward.data?.name) return unavailable;
      return validateCe8aAssignment(result, body.electionType, {
        code,
        state: state.data.name,
        lga: lga.data.name,
        ward: ward.data.name,
      });
    },
  ),
);
