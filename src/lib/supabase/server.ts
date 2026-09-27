import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createdWithProvider } from "@/lib/auth";
import { cookieOptions, supabaseConfig } from "./config";
import type { Database } from "./types";

export async function serverClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured. See .env.example.");
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* The proxy refreshes cookies for Server Components. */
        }
      },
    },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
  });
}
type Client = Awaited<ReturnType<typeof serverClient>>;

export function publicClient() {
  const config = supabaseConfig();
  if (!config) return null;
  // Public reads never inherit an owner's authenticated session.
  return createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
  });
}
// Cached per request: the layout and the page share one Auth round trip.
export const currentUser = cache(async () => {
  if (!supabaseConfig()) return null;
  const client = await serverClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return user;
});
// Unread messages for the header, once per request. A failure never breaks the page.
export const unreadMessageCount = cache(async () => {
  if (!(await currentUser())) return 0;
  const client = await serverClient();
  const { data, error } = await client.rpc("unread_message_count");
  return error || typeof data !== "number" ? 0 : data;
});
/**
 * Whether the user has finished sign-up. Accounts created through Google or GitHub have no
 * profile until they choose a username and accept the Terms.
 */
export async function hasFinishedSignup(client: Client, user: User) {
  if (!createdWithProvider(user)) return true;
  const { data, error } = await client
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("Your account could not be loaded. Please try again.");
  return !!data;
}
// The same for the signed-in user, once per request.
export const signupFinished = cache(async () => {
  const user = await currentUser();
  return !user || hasFinishedSignup(await serverClient(), user);
});
/**
 * The signed-in user, who has finished sign-up unless `unfinished` allows them not to have. Signing
 * in, or finishing sign-up, continues at `next`, which safeNext() has to accept.
 */
export async function requireUser({
  unfinished = false,
  next,
}: { unfinished?: boolean; next?: string } = {}) {
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  const user = await currentUser();
  if (!user) redirect(`/auth${query}`);
  if (!unfinished && !(await signupFinished())) redirect(`/auth/finish${query}`);
  return { user, client: await serverClient() };
}
/** Where a new account starts: listing its first product, until it has one. */
export async function startPage(client: Client, userId: string) {
  const { count, error } = await client
    .from("saas")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  return !error && count === 0 ? "/dashboard/saas/new" : "/dashboard";
}
