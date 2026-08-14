import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://pviqnnehvbmpiysjpxjh.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2aXFubmVodmJtcGl5c2pweGpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzODc1MTgsImV4cCI6MjA5Nzk2MzUxOH0.ATk6XmopgNs4qvCWJHFhE7oeWomVtUwbv3ZeywwQnWk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
