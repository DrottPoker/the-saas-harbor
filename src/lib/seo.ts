import type { Metadata } from "next";

export const SITE_NAME = "The SaaS Harbor";
export const SITE_DESCRIPTION =
  "A public directory of independent SaaS products, with a leaderboard of monthly recurring revenue verified through Stripe.";

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
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "profile";
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: SITE_NAME, type, locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
  };
}
