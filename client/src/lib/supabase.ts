import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tkghgqliyjtovttpuael.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrZ2hncWxpeWp0b3Z0dHB1YWVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5MDEyMzAsImV4cCI6MjA2NDQ3NzIzMH0.WXQwmEFGhAcMfgCuewcWqnvA4wuQ68L5ej9w8ZV7OGA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});