import type { MetadataRoute } from "next";
import { LOCALES, localizedPath } from "@/i18n/config";
import { siteUrl } from "@/lib/seo";

// Private areas and one-time pages, which have an address in every language.
const PRIVATE = ["/dashboard", "/messages", "/report", "/feedback", "/auth", "/account-deleted"];

// Public pages are open to crawlers; private areas and one-time pages are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        ...LOCALES.flatMap((locale) => PRIVATE.map((path) => localizedPath(locale, path))),
        "/admin",
        "/api",
        // Where the proxy serves Markdown versions from; /saas/<slug>.md is the address to use.
        "/md/",
      ],
    },
    // One sitemap per language: /sitemap.xml for English, /<locale>/sitemap.xml for the others.
    sitemap: LOCALES.map(
      (locale) => `${siteUrl()}${locale === "en" ? "" : `/${locale}`}/sitemap.xml`,
    ),
  };
}
