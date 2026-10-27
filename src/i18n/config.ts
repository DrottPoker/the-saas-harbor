// The site's languages and how their addresses are built. Shared by the proxy, the server and the
// browser, so it holds no server-only code.

export const LOCALES = ["en", "zh", "hi", "ar", "es", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** The visitor's own choice of language, set from the menu in the header. */
export const LOCALE_COOKIE = "locale";
/** The language of the request, which the proxy sets from the address. */
export const LOCALE_HEADER = "x-harbor-locale";

type LocaleInfo = {
  /** The language's name in itself, as the menu shows it. */
  name: string;
  /** A short form for the header. */
  short: string;
  /** For `lang` attributes: the script for Chinese, so fonts and screen readers pick it. */
  lang: string;
  /** For `Intl` formats: Latin American Spanish, and Western digits in Arabic. */
  intl: string;
  /** For hreflang: the language alone, so one version serves every region. */
  hreflang: string;
  /** Open Graph's language_TERRITORY form. */
  og: string;
  dir: "ltr" | "rtl";
};

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  en: { name: "English", short: "EN", lang: "en", intl: "en-US", hreflang: "en", og: "en_US", dir: "ltr" },
  zh: { name: "简体中文", short: "中文", lang: "zh-Hans", intl: "zh-CN", hreflang: "zh", og: "zh_CN", dir: "ltr" },
  hi: { name: "हिन्दी", short: "हिन्दी", lang: "hi", intl: "hi-IN", hreflang: "hi", og: "hi_IN", dir: "ltr" },
  ar: { name: "العربية", short: "عربي", lang: "ar", intl: "ar-u-nu-latn", hreflang: "ar", og: "ar_AR", dir: "rtl" },
  es: { name: "Español", short: "ES", lang: "es", intl: "es-419", hreflang: "es", og: "es_LA", dir: "ltr" },
  ru: { name: "Русский", short: "RU", lang: "ru", intl: "ru-RU", hreflang: "ru", og: "ru_RU", dir: "ltr" },
}; // prettier-ignore

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// Addresses that are the same in every language: files, routes for machines, the Markdown versions,
// the sign-in returns that providers are told about, and the admin panel, which is in English.
// Everything else is a page, which other languages serve under /<locale>.
const SHARED_PATH =
  /^\/(?:api|md|_next|admin|auth\/callback|auth\/oauth)(?:\/|$)|\.(?:md|txt|svg|png|ico|xml|json)$|\/(?:opengraph-image|icon|apple-icon)$/;

/** Whether a path is a page that has a version per language. */
export function isLocalizedPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !SHARED_PATH.test(path.split(/[?#]/)[0]);
}

/**
 * A site path in a language: English keeps the path as it is, the others add their prefix. Paths
 * that are not pages, and addresses on other sites, are returned unchanged.
 */
export function localizedPath(locale: Locale, path: string) {
  if (!isLocalizedPath(path)) return path;
  const [, page = "", rest = ""] = splitLocale(path).path.match(/^\/([^?#]*)(.*)$/) ?? [];
  if (locale === DEFAULT_LOCALE) return `/${page}${rest}`;
  return page ? `/${locale}/${page}${rest}` : `/${locale}${rest}`;
}

/** The language a path is in, and the path without its prefix. */
export function splitLocale(path: string): { locale: Locale | null; path: string } {
  const match = path.match(/^\/([a-z]{2})([/?#].*)?$/);
  if (!match || !isLocale(match[1])) return { locale: null, path };
  const rest = match[2] ?? "";
  return { locale: match[1], path: rest.startsWith("/") ? rest : `/${rest}` };
}
