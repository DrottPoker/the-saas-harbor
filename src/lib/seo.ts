import type { Metadata } from "next";

export const SITE_NAME = "The SaaS Harbor";
export const SITE_DESCRIPTION =
  "A public directory of independent SaaS products, with a leaderboard of monthly recurring revenue verified through their payment providers.";

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
}): Metadata {
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
 * The rel of the link from a product's page to its website. Search engines are asked to follow it
 * only while the product's revenue is verified, shared or private, so the link rewards real
 * products rather than spam. Without noreferrer, the founder's analytics show the visits we send.
 */
export function websiteRel(revenueStatus: string | null | undefined) {
  return revenueStatus === "verified" || revenueStatus === "private"
    ? "noopener"
    : "noopener nofollow";
}
