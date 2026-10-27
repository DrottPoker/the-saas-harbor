import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_INFO, LOCALES, localizedPath, type Locale } from "@/i18n/config";
import { formatList } from "@/i18n/list";
import type { Listing } from "./data";
import { formatUsdIn } from "./display-money";
import { safePage } from "./params";

export const SITE_NAME = "The SaaS Harbor";
/** The site's description in English, for text that is the same for everyone, such as llms.txt. */
export const SITE_DESCRIPTION =
  "A free directory of independent SaaS products, new and established, with a leaderboard of monthly recurring revenue verified through their payment providers.";

/** The canonical origin, which absolute addresses in metadata, the sitemap and robots use. */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "");
}

/**
 * A page's address in every language, keyed by hreflang, with English as the default for
 * languages the site does not have.
 */
export function languageAlternates(path: string) {
  return {
    ...Object.fromEntries(
      LOCALES.map((locale) => [LOCALE_INFO[locale].hreflang, localizedPath(locale, path)]),
    ),
    "x-default": localizedPath("en", path),
  };
}

/** Open Graph's other languages of a page. */
const otherOgLocales = (locale: Locale) =>
  LOCALES.filter((other) => other !== locale).map((other) => LOCALE_INFO[other].og);

/**
 * Metadata for a public page: its canonical address in the page's language, its versions in the
 * other languages, and matching social cards. `path` is the English address. Next.js replaces a
 * parent's openGraph object as a whole, so every page repeats the site name.
 */
export async function pageMetadata({
  title,
  description,
  path,
  type = "website",
  markdown = false,
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "profile";
  /** The page has a Markdown version for AI assistants at the same address plus `.md`. */
  markdown?: boolean;
}): Promise<Metadata & { title: string }> {
  const locale = await getLocale();
  const canonical = localizedPath(locale, path);
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: languageAlternates(path),
      ...(markdown && { types: { "text/markdown": `${path}.md` } }),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type,
      locale: LOCALE_INFO[locale].og,
      alternateLocale: otherOgLocales(locale),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Metadata for a list that a search, filters and pages vary. Search results are not indexed, a
 * filtered list points search engines at the plain one, and each later page is a page of its own,
 * as Google advises for lists split into pages. `laterTitle` names the later pages when the first
 * page's title describes the whole site.
 */
export async function listMetadata(
  list: { title: string; description: string; path: string; laterTitle?: string },
  params: Record<string, string | undefined>,
): Promise<Metadata & { title: string }> {
  const t = await getTranslations("seo");
  const search = !!params.q?.trim();
  const page = search || params.category || params.tech ? 1 : safePage(params.page);
  return {
    ...(await pageMetadata({
      title: page > 1 ? t("laterPage", { title: list.laterTitle ?? list.title, page }) : list.title,
      description: list.description,
      path: page > 1 ? `${list.path}${list.path.includes("?") ? "&" : "?"}page=${page}` : list.path,
    })),
    ...(search && { robots: { index: false, follow: true } }),
  };
}

const FULL_STOP: Partial<Record<Locale, string>> = { zh: "。", hi: "।" };

/** Text as a sentence: the language's full stop is added unless it already ends in one. */
function sentence(text: string, locale: Locale) {
  const line = text.trim();
  return /[.!?…。！？।؟]$/.test(line) ? line : `${line}${FULL_STOP[locale] ?? "."}`;
}

/**
 * A product page's title and description, as search results and shared links show them. They
 * carry a figure the page shares only when it is above zero: MRR, or else revenue from all
 * payments, which products sold once have instead of MRR. Figures are in US dollars, written in the
 * page's language, so search results do not depend on where a crawler is.
 */
export async function productSummary(item: Pick<Listing, ProductSummaryField>) {
  const [t, locale] = await Promise.all([getTranslations("seo"), getLocale()]);
  const usd = (cents: number) => formatUsdIn(cents, LOCALE_INFO[locale].intl);
  const name = item.name ?? "";
  const mrr = item.revenue_status === "verified" && item.mrr_cents ? item.mrr_cents : null;
  const revenue = item.revenue_total_cents || null;
  return {
    title: mrr
      ? t("productTitleMrr", { name, amount: usd(mrr) })
      : revenue
        ? t("productTitleRevenue", { name, amount: usd(revenue) })
        : name,
    description: [
      item.tagline?.trim() && sentence(item.tagline, locale),
      mrr &&
        (item.customers
          ? t("productMrrSubscribers", { amount: usd(mrr), count: item.customers })
          : t("productMrr", { amount: usd(mrr) })),
      revenue && t("productRevenue", { amount: usd(revenue) }),
    ]
      .filter(Boolean)
      .join(" "),
  };
}

type ProductSummaryField =
  "name" | "tagline" | "revenue_status" | "mrr_cents" | "customers" | "revenue_total_cents";

/**
 * A profile page's description: the headline, and the products the user is the founder of, which
 * people often search for. Names are joined as the language does: "A, B and C", and at most three
 * before "2 more".
 */
export async function profileDescription(
  profile: { name: string; headline: string | null },
  products: string[],
) {
  const [t, locale] = await Promise.all([getTranslations("seo"), getLocale()]);
  const most = 3;
  const names =
    products.length > most
      ? [...products.slice(0, most), t("namesMore", { count: products.length - most })]
      : products;
  const list = formatList(names, locale);
  const founder = products.length ? t("founderOf", { products: list }) : "";
  const lead = profile.headline ? sentence(profile.headline, locale) : "";
  if (lead) return [lead, founder].filter(Boolean).join(" ");
  return products.length
    ? t("profileFounder", { name: profile.name, products: list, site: SITE_NAME })
    : t("profileOnSite", { name: profile.name, site: SITE_NAME });
}

/**
 * The rel of the link from a product's page to its website. Search engines are asked to follow it
 * only while the product's revenue is verified, shared or private, so the link rewards real
 * products rather than spam. Without noreferrer, the founder's analytics show the visits we send.
 */
export function websiteRel(revenueStatus: string | null | undefined) {
  return revenueStatus === "verified" || revenueStatus === "private"
    ? "noopener"
    : "noopener nofollow";
}
