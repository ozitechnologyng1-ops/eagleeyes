import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectTables() {
  console.log("Fetching sample data from tables...");
  
  const tables = ['election_results', 'polling_unit', 'wards', 'local_governments', 'states'];
  
  for (const t of tables) {
      console.log(`\n--- Inspecting ${t} ---`);
      try {
          const { data, error } = await supabase.from(t).select('*').limit(1);
          if (error) {
              console.error(`Error fetching ${t}:`, error.message);
          } else {
              console.log(`Successfully fetched ${t}.`);
              if (data && data.length > 0) {
                  console.log("Columns:", Object.keys(data[0]));
                  console.log("Sample Data:", data[0]);
              } else {
                  console.log("Table is empty but accessible. Cannot infer schema from an empty table without openapi access.");
              }
          }
      } catch (err) {
          console.error(err);
      }
  }
}

inspectTables();
