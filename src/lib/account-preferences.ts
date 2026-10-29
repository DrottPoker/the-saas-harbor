import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isLocale } from "@/i18n/config";
import { isCurrency } from "@/i18n/currencies";
import type { Database } from "./supabase/types";

/** Keeps the latest account preferences without interrupting sign-in. */
export async function rememberAccountPreferences(
  client: SupabaseClient<Database>,
  user: Pick<User, "user_metadata">,
  preferences: { locale?: string; currency?: string },
) {
  const { locale, currency } = preferences;
  const data: Record<string, string> = {};
  if (isLocale(locale) && user.user_metadata?.locale !== locale) data.locale = locale;
  if (isCurrency(currency) && user.user_metadata?.currency !== currency) data.currency = currency;
  if (!Object.keys(data).length) return;
  const { error } = await client.auth.updateUser({ data });
  if (error) console.error("Saving account preferences failed:", error.code ?? "unknown");
}
