import { createClient } from '@supabase/supabase-js';

const ACTIVE_SUPABASE_URL = 'https://pviqnnehvbmpiysjpxjh.supabase.co';
const ACTIVE_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2aXFubmVodmJtcGl5c2pweGpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzODc1MTgsImV4cCI6MjA5Nzk2MzUxOH0.ATk6XmopgNs4qvCWJHFhE7oeWomVtUwbv3ZeywwQnWk';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = (!rawUrl || rawUrl.includes('xiimvwjmblnxrxfrbzee'))
  ? ACTIVE_SUPABASE_URL
  : rawUrl;

const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAnonKey = (!rawKey || rawKey.includes('xiimvwjmblnxrxfrbzee'))
  ? ACTIVE_SUPABASE_ANON_KEY
  : rawKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
