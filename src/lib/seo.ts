import type { Metadata } from "next";
import type { Listing } from "./data";
import { formatUsd } from "./domain";
import { excerpt } from "./moderation";
import { safePage } from "./params";

export const SITE_NAME = "The SaaS Harbor";
export const SITE_DESCRIPTION =
  "A free directory of independent SaaS products, new and established, with a leaderboard of monthly recurring revenue verified through their payment providers.";

/** The canonical origin, which absolute addresses in metadata, the sitemap and robots use. */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "");
}

/**
 * Metadata for a public page: its canonical address and matching social cards. Next.js replaces a
 * parent's openGraph object as a whole, so every page repeats the site name.
 */
export function pageMetadata({
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
}): Metadata & { title: string } {
  return {
    title,
    description,
    alternates: {
      canonical: path,
      ...(markdown && { types: { "text/markdown": `${path}.md` } }),
    },
    openGraph: { title, description, url: path, siteName: SITE_NAME, type, locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Metadata for a list that a search, filters and pages vary. Search results are not indexed, a
 * filtered list points search engines at the plain one, and each later page is a page of its own,
 * as Google advises for lists split into pages. `laterTitle` names the later pages when the first
 * page's title describes the whole site.
 */
export function listMetadata(
  list: { title: string; description: string; path: string; laterTitle?: string },
  params: Record<string, string | undefined>,
): Metadata & { title: string } {
  const search = !!params.q?.trim();
  const page = search || params.category || params.tech ? 1 : safePage(params.page);
  return {
    ...pageMetadata({
      title: page > 1 ? `${list.laterTitle ?? list.title}, page ${page}` : list.title,
      description: list.description,
      path: page > 1 ? `${list.path}${list.path.includes("?") ? "&" : "?"}page=${page}` : list.path,
    }),
    ...(search && { robots: { index: false, follow: true } }),
  };
}

/** Text as a sentence: a full stop is added unless it already ends in one. */
function sentence(text: string) {
  const line = text.trim();
  return /[.!?…]$/.test(line) ? line : `${line}.`;
}

/**
 * A product page's title and description, as search results and shared links show them. They
 * carry a figure the page shares only when it is above zero: MRR, or else revenue from all
 * payments, which products sold once have instead of MRR.
 */
export function productSummary(item: Pick<Listing, ProductSummaryField>) {
  const name = item.name ?? "";
  const mrr = item.revenue_status === "verified" && item.mrr_cents ? item.mrr_cents : null;
  const revenue = item.revenue_total_cents || null;
  const customers = item.customers
    ? ` from ${item.customers.toLocaleString("en-US")} ${item.customers === 1 ? "subscriber" : "subscribers"}`
    : "";
  return {
    title: mrr
      ? `${name}: ${formatUsd(mrr)} verified MRR`
      : revenue
        ? `${name}: ${formatUsd(revenue)} verified revenue`
        : name,
    description: [
      sentence(item.tagline ?? ""),
      mrr && `Verified MRR ${formatUsd(mrr)}${customers}.`,
      revenue && `Verified revenue, all time: ${formatUsd(revenue)}.`,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

type ProductSummaryField =
  "name" | "tagline" | "revenue_status" | "mrr_cents" | "customers" | "revenue_total_cents";

/** Names joined as a reader would say them: "A", "A and B", "A, B and C", "A, B, C and 2 more". */
function nameList(names: string[], most = 3) {
  if (names.length > most)
    return `${names.slice(0, most).join(", ")} and ${names.length - most} more`;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
}

/**
 * A profile page's description: the headline or the start of the About section, and the products
 * the user is the founder of, which people often search for.
 */
export function profileDescription(
  profile: { name: string; headline: string | null; bio: string | null },
  products: string[],
) {
  const founder = products.length ? `Founder of ${nameList(products)}.` : "";
  const about = profile.headline || (profile.bio && excerpt(profile.bio, founder ? 110 : 160));
  const lead = about ? sentence(about) : "";
  if (lead) return [lead, founder].filter(Boolean).join(" ");
  return products.length
    ? `${profile.name}, founder of ${nameList(products)}, on ${SITE_NAME}.`
    : `${profile.name} on ${SITE_NAME}`;
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
