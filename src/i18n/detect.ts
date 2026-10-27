// A first visit's language and currency, before the visitor has chosen. Pure, so the proxy and the
// tests share it.
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { BASE_CURRENCY, countryCurrency, isCurrency, type Currency } from "./currencies";

type Preference = { tag: string; q: number; order: number };

/** The languages of an Accept-Language header, most preferred first. */
function preferences(header: string | null | undefined): Preference[] {
  if (!header) return [];
  return header
    .split(",")
    .slice(0, 20)
    .map((part, order) => {
      const [tag, ...params] = part.trim().split(";");
      // A weight that is not a number leaves the language out.
      const weight = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q =
        weight === undefined
          ? 1
          : /^q=[01](?:\.\d{0,3})?$/.test(weight)
            ? Number(weight.slice(2))
            : 0;
      return { tag: tag.trim().toLowerCase(), q, order };
    })
    .filter(({ tag, q }) => /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag) && q > 0 && q <= 1)
    .sort((a, b) => b.q - a.q || a.order - b.order);
}

// Traditional Chinese readers are not sent to Simplified Chinese; their next choice decides.
const TRADITIONAL_CHINESE = /^zh-(?:hant|tw|hk|mo)(?:-|$)/;

/** The site language that best matches the browser's languages, English when none does. */
export function negotiateLocale(header: string | null | undefined): Locale {
  for (const { tag } of preferences(header)) {
    if (TRADITIONAL_CHINESE.test(tag)) continue;
    const language = tag.split("-")[0];
    if (isLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}

/**
 * The currency for a first visit: the country the host looks up from the IP address (Vercel's
 * x-vercel-ip-country), else the region of the browser's first language that names one, such as
 * es-MX, else USD.
 */
export function detectCurrency(
  country: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Currency {
  if (country && /^[A-Za-z]{2}$/.test(country) && country.toUpperCase() !== "XX")
    return countryCurrency(country);
  for (const { tag } of preferences(acceptLanguage)) {
    const region = tag.split("-").find((part, i) => i > 0 && /^[a-z]{2}$/.test(part));
    if (region) return countryCurrency(region);
  }
  return BASE_CURRENCY;
}

/** A saved currency choice, if it is one the site offers. */
export function savedCurrency(value: string | null | undefined): Currency | null {
  const upper = value?.toUpperCase();
  return isCurrency(upper) ? upper : null;
}
