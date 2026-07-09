import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ydegxkfpzqfwcrfhcjge.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZWd4a2ZwenFmd2NyZmhjamdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjkzMTQsImV4cCI6MjA5ODU0NTMxNH0.olbIfD7_J48us-zfGFxzesFAwc6U1kJwfYTncSBJzEg'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkCases() {
  const { data, error } = await supabase.from('ortho_cases').select('*')
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log(`Found ${data.length} cases.`)
  for (const c of data) {
    console.log(`Case ${c.id}: status=${c.status}, images=${JSON.stringify(c.images)}`)
  }
}

checkCases()
