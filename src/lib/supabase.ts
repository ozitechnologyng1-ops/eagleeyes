import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wetkmmfvmabfqseiiysk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndldGttbWZ2bWFiZnFzZWlpeXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODIxMzYsImV4cCI6MjA5MTc1ODEzNn0.zE0oqqVSu8Pztc7yzugnBsX_OAB8uS5GY7k5fSd5gKM';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const customFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);

  // 1. Retrieve the active logged-in agent session
  const savedUser = localStorage.getItem('eagleeye_user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      if (parsed?.id) {
        headers.set('x-agent-id', parsed.id);
      }
      if (parsed?.phone) {
        headers.set('x-agent-phone', parsed.phone);
      }
    } catch (e) {
      console.error('Failed to parse saved user for custom RLS headers:', e);
    }
  }

  // 2. Check for temporary login phone number (for authenticating/looking up the agent)
  const tempPhone = sessionStorage.getItem('temp_login_phone');
  if (tempPhone) {
    headers.set('x-agent-phone', tempPhone);
  }

  return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: customFetch
  }
});
