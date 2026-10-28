// Supabase Edge Function: deletes the calling user's account. Deploy by hand (see README, "Account deletion").
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided to every Edge Function by Supabase; the
// admin key never leaves the server. ALLOWED_ORIGINS (optional) is a comma-separated list of app origins for CORS.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createDeleteAccountHandler } from './handler.js';

Deno.serve(createDeleteAccountHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  adminKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigins: Deno.env.get('ALLOWED_ORIGINS') ?? '',
  createClient,
}));
