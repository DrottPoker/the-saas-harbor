"use server";

import { isLocale } from "@/i18n/config";
import { isCurrency } from "@/i18n/currencies";
import { rememberAccountPreferences } from "@/lib/account-preferences";
import { wantedCurrency } from "@/lib/display-currency";
import { requireUser } from "@/lib/supabase/server";

/**
 * Keeps a signed-in user's language with their account, for the emails the site sends them. The
 * language of pages is the visitor's cookie, which the menu sets in the browser.
 */
export async function saveAccountLanguageAction(locale: string) {
  if (!isLocale(locale)) return;
  const { user, client } = await requireUser({ unfinished: true });
  await rememberAccountPreferences(client, user, { locale, currency: await wantedCurrency() });
}

/** Records a currency change without changing the account's email language. */
export async function saveAccountCurrencyAction(currency: string) {
  if (!isCurrency(currency)) return;
  const { user, client } = await requireUser({ unfinished: true });
  await rememberAccountPreferences(client, user, { currency });
}
