import { LOCALE_INFO, type Locale } from "./config";

/**
 * Names joined as the language joins them: "A, B and C" in English, "A、B 和 C" in Chinese. English
 * uses the British form, which leaves out the comma before "and", as the site's English copy does.
 */
export function formatList(
  items: string[],
  locale: Locale,
  type: "conjunction" | "disjunction" = "conjunction",
) {
  const tag = locale === "en" ? "en-GB" : LOCALE_INFO[locale].intl;
  return new Intl.ListFormat(tag, { type, style: "long" }).format(items);
}
