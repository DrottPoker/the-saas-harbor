"use server";

import { isLocale } from "@/i18n/config";
import { rememberAccountLanguage } from "@/lib/account-language";
import { requireUser } from "@/lib/supabase/server";

/**
 * Keeps a signed-in user's language with their account, for the emails the site sends them. The
 * language of pages is the visitor's cookie, which the menu sets in the browser.
 */
export async function saveAccountLanguageAction(locale: string) {
  if (!isLocale(locale)) return;
  const { user, client } = await requireUser({ unfinished: true });
  await rememberAccountLanguage(client, user, locale);
}
