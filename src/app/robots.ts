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
        "/auth",
        "/account-deleted",
        "/api",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
