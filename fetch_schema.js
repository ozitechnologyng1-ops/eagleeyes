import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
  console.log("Fetching tables...");
  
  try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_KEY}`, {
          headers: {
              'Authorization': `Bearer ${SUPABASE_KEY}`
          }
      });
      if (!response.ok) {
          console.error("Failed to fetch schema:", response.statusText);
          return;
      }
      const data = await response.json();
      const tables = Object.keys(data.definitions);
      
      const targetTables = tables.filter(t => t.includes('result') || t.includes('election') || t.includes('polling_unit'));
      console.log("Found related tables:", targetTables);
      
      for(const t of targetTables) {
          console.log(`\nTable Schema for ${t}:`);
          console.log(data.definitions[t].properties);
      }
  } catch (e) {
      console.error(e);
  }
}

checkSchema();
