// Supabase Edge Function: permanently deletes accounts whose 7-day restore window has ended. Called once a day by a
// scheduled job with the x-cron-secret header (README, "Account deletion"). Deploy by hand.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase; set CRON_SECRET yourself.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createPurgeHandler } from './handler.js';

Deno.serve(createPurgeHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  adminKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  cronSecret: Deno.env.get('CRON_SECRET'),
  createClient,
}));
