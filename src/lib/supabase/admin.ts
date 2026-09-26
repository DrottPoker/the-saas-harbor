import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";
import type { Database } from "./types";

// Privileged client for trusted server work only: revenue verification, the results of domain
// checks, the email outbox and the site statistics. It bypasses RLS, so it is never used for
// anything a maker controls directly.
export function adminClient() {
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) throw new Error("The service role key is not configured on this server.");
  return createClient<Database>(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
  });
}
