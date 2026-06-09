import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectPU() {
  console.log("Fetching polling_units...");
          const { data, error } = await supabase.from('polling_units').select('*').limit(1);
          if (error) {
              console.error(`Error fetching:`, error.message);
          } else {
              console.log(`Successfully fetched.`);
              if (data && data.length > 0) {
                  console.log("Columns:", Object.keys(data[0]));
              }
          }
}
inspectPU();
