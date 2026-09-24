import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";
import type { Database } from "./types";

// The signed-in maker's client in the browser, for Realtime and reads under RLS. Writes go through
// Server Actions. @supabase/ssr returns one shared instance per page.
export function browserClient() {
  const config = supabaseConfig();
  return config ? createBrowserClient<Database>(config.url, config.key) : null;
}
