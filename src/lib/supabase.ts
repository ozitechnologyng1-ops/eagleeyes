import { createClient } from "@supabase/supabase-js";
import { agentRequestHeaders } from "./agentSession";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wetkmmfvmabfqseiiysk.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndldGttbWZ2bWFiZnFzZWlpeXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODIxMzYsImV4cCI6MjA5MTc1ODEzNn0.zE0oqqVSu8Pztc7yzugnBsX_OAB8uS5GY7k5fSd5gKM";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const customFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const original = init?.headers || (input instanceof Request ? input.headers : undefined);
  const url = new URL(input instanceof Request ? input.url : String(input), supabaseUrl);
  const headers =
    url.origin === new URL(supabaseUrl).origin
      ? agentRequestHeaders(original, !url.pathname.startsWith("/functions/v1/whatsapp-"))
      : new Headers(original);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: customFetch,
  },
});
