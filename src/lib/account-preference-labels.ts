import { isLocale, LOCALE_INFO } from "@/i18n/config";
import { isCurrency } from "@/i18n/currencies";

export type AccountPreferences = { locale: string | null; currency: string | null };

/** The admin panel uses English names, including the script for Simplified Chinese. */
export function accountLanguageLabel(locale: unknown) {
  return isLocale(locale)
    ? new Intl.DisplayNames(["en"], { type: "language" }).of(LOCALE_INFO[locale].lang)!
    : "Not recorded";
}

export function accountCurrencyLabel(currency: unknown) {
  return isCurrency(currency) ? currency : "Not recorded";
}
