import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseConfig } from "./config";
import type { Database } from "./types";

export async function serverClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured. See .env.example.");
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.key, { cookies: {
    getAll: () => cookieStore.getAll(),
    setAll(values) {
      try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
      catch { /* The proxy refreshes cookies for Server Components. */ }
    },
  }, global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) } });
}
export function publicClient() {
  const config = supabaseConfig();
  if (!config) return null;
  // Public reads never inherit an owner's authenticated session.
  return createClient<Database>(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) } });
}
export async function currentUser() {
  if (!supabaseConfig()) return null;
  const client = await serverClient();
  const { data: { user } } = await client.auth.getUser();
  return user;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/auth");
  return { user, client: await serverClient() };
}

