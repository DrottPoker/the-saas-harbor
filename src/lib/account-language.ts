import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isLocale } from "@/i18n/config";
import type { Database } from "./supabase/types";

/** Remembers the signed-in user's language for emails without interrupting sign-in. */
export async function rememberAccountLanguage(
  client: SupabaseClient<Database>,
  user: Pick<User, "user_metadata">,
  locale: string,
) {
  if (!isLocale(locale) || user.user_metadata?.locale === locale) return;
  const { error } = await client.auth.updateUser({ data: { locale } });
  if (error) console.error("Saving the account language failed:", error.code ?? "unknown");
}
