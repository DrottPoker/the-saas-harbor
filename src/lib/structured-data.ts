// Structured data (schema.org JSON-LD) that tells search engines and AI assistants what a page is
// about. It repeats only what the page shows publicly, and demo products never get any.
import type { Listing, Profile } from "./data";
import { categorySlug } from "./domain";
import { imageUrl } from "./images";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "./seo";

type JsonLd = Record<string, unknown>;

// Google's application categories where one fits; the rest are business software.
const applicationCategories: Record<string, string> = {
  "Developer Tools": "DeveloperApplication",
  Design: "DesignApplication",
  Finance: "FinanceApplication",
};

function breadcrumbs(items: { name: string; path: string }[]): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteUrl()}${item.path}`,
    })),
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${siteUrl()}/`,
    description: SITE_DESCRIPTION,
  };
}

export function productJsonLd(item: Listing): JsonLd {
  const path = `/saas/${item.slug}`;
  const category = item.category ?? "Other";
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${siteUrl()}${path}`,
    url: `${siteUrl()}${path}`,
    name: item.name,
    description: item.tagline,
    breadcrumb: breadcrumbs([
      { name: "Browse", path: "/discover" },
      { name: category, path: `/categories/${categorySlug(category)}` },
      { name: item.name ?? "SaaS", path },
    ]),
    mainEntity: {
      "@type": "SoftwareApplication",
      name: item.name,
      description: item.description,
      applicationCategory: applicationCategories[category] ?? "BusinessApplication",
      applicationSubCategory: category,
      url: item.website ?? `${siteUrl()}${path}`,
      image: imageUrl(item.logo_path) ?? undefined,
      datePublished: item.launched_on ?? undefined,
      creator: {
        "@type": "Person",
        name: item.owner_name,
        url: `${siteUrl()}/users/${item.owner_slug}`,
      },
    },
  };
}

export function makerJsonLd(profile: Profile): JsonLd {
  const url = `${siteUrl()}/users/${profile.slug}`;
  const links = [
    profile.website,
    profile.linkedin_url,
    profile.github_url,
    profile.x_url,
    profile.social_url,
  ].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": url,
    url,
    dateModified: profile.updated_at,
    mainEntity: {
      "@type": "Person",
      name: profile.name,
      description: profile.headline || undefined,
      image: imageUrl(profile.avatar_path) ?? undefined,
      homeLocation: profile.location ? { "@type": "Place", name: profile.location } : undefined,
      sameAs: links.length ? links : undefined,
      url,
    },
  };
}

export function categoriesJsonLd(categories: string[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: `${siteUrl()}/categories`,
    name: "Categories",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: categories.map((category, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: category,
        url: `${siteUrl()}/categories/${categorySlug(category)}`,
      })),
    },
  };
}

/** A category page and its ranked products, in leaderboard order. */
export function categoryJsonLd(category: string, ranked: Listing[]): JsonLd {
  const path = `/categories/${categorySlug(category)}`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: `${siteUrl()}${path}`,
    name: `${category} SaaS`,
    breadcrumb: breadcrumbs([
      { name: "Categories", path: "/categories" },
      { name: category, path },
    ]),
    mainEntity: {
      "@type": "ItemList",
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: ranked.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: `${siteUrl()}/saas/${item.slug}`,
      })),
    },
  };
}

/** JSON for a script element: `<` is escaped so the text can never close the element. */
export function serializeJsonLd(data: JsonLd) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
