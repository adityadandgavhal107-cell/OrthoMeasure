import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8')
const env = {}
envFile.split('\n').forEach(line => {
  if (line.includes('=')) {
    const parts = line.split('=')
    env[parts[0].trim()] = parts[1].trim()
  }
})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function upload() {
  const data = fs.readFileSync('rl_model_data.json');
  const { data: d, error } = await supabase.storage.from('scans').upload('rl_model_data.json', data, { upsert: true });
  if (error) console.error(error);
  else console.log('success');
}
upload();
