import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// Public pages are open to crawlers; private areas and one-time pages are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/messages",
        "/report",
        "/feedback",
        "/auth",
        "/account-deleted",
        "/api",
        // Where the proxy serves Markdown versions from; /saas/<slug>.md is the address to use.
        "/md/",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
