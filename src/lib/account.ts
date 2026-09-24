import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./supabase/config";
import type { Database } from "./supabase/types";

type Bucket = ReturnType<SupabaseClient<Database>["storage"]["from"]>;

const BUCKET = "profile-images";
const IMAGES_FAILED = "Your images could not be deleted, so the account was kept. Try again.";

// Every file path under the maker's folder, including any subfolders.
async function filesUnder(bucket: Bucket, prefix: string, depth = 0): Promise<string[]> {
  const { data, error } = await bucket.list(prefix, { limit: 1000 });
  if (error) throw new Error(IMAGES_FAILED);
  const paths: string[] = [];
  for (const entry of data) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id) paths.push(path);
    else if (depth < 5) paths.push(...(await filesUnder(bucket, path, depth + 1)));
  }
  return paths;
}

// Repeats until the folder is empty, so a listing page limit or an upload in another tab cannot
// leave files behind.
async function removeImages(client: SupabaseClient<Database>, userId: string) {
  const bucket = client.storage.from(BUCKET);
  for (let round = 0; round < 50; round++) {
    const paths = await filesUnder(bucket, userId);
    if (!paths.length) return;
    for (let start = 0; start < paths.length; start += 1000) {
      const { error } = await bucket.remove(paths.slice(start, start + 1000));
      if (error) throw new Error(IMAGES_FAILED);
    }
  }
  throw new Error(IMAGES_FAILED);
}

/**
 * Deletes the signed-in maker's account and everything it owns. The password is checked by
 * signing in again on a separate client; the database only accepts deletion from a password
 * sign-in of the last five minutes, so that fresh session makes both requests. Images go first,
 * through the Storage API: if that fails, the account stays in place and can be deleted again.
 */
export async function deleteAccount(userId: string, email: string, password: string) {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const client = createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429)
      throw new Error("Too many attempts. Wait a few minutes and try again.");
    if (error.code !== "invalid_credentials")
      throw new Error("Your password could not be checked. Try again shortly.");
    throw new Error("The password is incorrect.");
  }
  try {
    // The email comes from the current session, so this only guards against a mix-up.
    if (data.user.id !== userId) throw new Error("Your account could not be deleted. Try again.");
    await removeImages(client, userId);
    const { error: deleteError } = await client.rpc("delete_account");
    if (deleteError) throw new Error("Your account could not be deleted. Try again.");
  } catch (cause) {
    // The confirmation session is not needed once the attempt failed.
    await client.auth.signOut({ scope: "local" });
    throw cause;
  }
}
