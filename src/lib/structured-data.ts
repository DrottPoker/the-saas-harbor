// Structured data (schema.org JSON-LD) that tells search engines and AI assistants what a page is
// about. It repeats only what the page shows publicly, and demo products never get any.
import { cache } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_INFO, LOCALES, localizedPath } from "@/i18n/config";
import { categoryKey } from "@/i18n/names";
import type { Listing, Profile } from "./data";
import { categorySlug } from "./domain";
import { imageUrl } from "./images";
import { SITE_NAME, siteUrl } from "./seo";
import type { Tech } from "./tech";

type JsonLd = Record<string, unknown>;

// Google's application categories where one fits; the rest are business software.
const applicationCategories: Record<string, string> = {
  "Developer Tools": "DeveloperApplication",
  Design: "DesignApplication",
  Finance: "FinanceApplication",
};

// Ids that tie every page to the site and the organization behind it, which the home page
// describes.
const websiteId = () => `${siteUrl()}/#website`;
const organizationId = () => `${siteUrl()}/#organization`;
const isPartOf = () => ({ "@id": websiteId() });

// Site entities keep stable ids; pages use their own language and canonical address.
const pageLanguage = cache(async () => {
  const [locale, seo, lists, names, home] = await Promise.all([
    getLocale(),
    getTranslations("seo"),
    getTranslations("lists"),
    getTranslations("categories"),
    getTranslations("home"),
  ]);
  return {
    tag: LOCALE_INFO[locale].lang,
    url: (path: string) => `${siteUrl()}${localizedPath(locale, path)}`,
    seo,
    lists,
    names,
    home,
  };
});
type PageLanguage = Awaited<ReturnType<typeof pageLanguage>>;

/** The organization's logo, served by src/app/logo.png. */
export const LOGO_SIZE = 512;

function breadcrumbs(items: { name: string; path: string }[], page: PageLanguage): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: page.url(item.path),
    })),
  };
}

/** The site and the organization that runs it, for the home page. */
export async function siteJsonLd(): Promise<JsonLd> {
  const page = await pageLanguage();
  const url = `${siteUrl()}/`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId(),
        name: SITE_NAME,
        url,
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl()}/logo.png`,
          width: LOGO_SIZE,
          height: LOGO_SIZE,
        },
        description: page.seo("siteDescription"),
      },
      {
        "@type": "WebSite",
        "@id": websiteId(),
        name: SITE_NAME,
        alternateName: "SaaS Harbor",
        url,
        description: page.seo("siteDescription"),
        inLanguage: LOCALES.map((locale) => LOCALE_INFO[locale].lang),
        publisher: { "@id": organizationId() },
      },
      {
        "@type": "WebPage",
        "@id": `${page.url("/")}#webpage`,
        url: page.url("/"),
        name: page.home("meta.title"),
        description: page.home("meta.description"),
        inLanguage: page.tag,
        isPartOf: isPartOf(),
        about: { "@id": organizationId() },
      },
    ],
  };
}

/** A page of questions and answers, exactly as the page shows them. */
export async function faqJsonLd(path: string, name: string, questions: FaqItem[]): Promise<JsonLd> {
  const page = await pageLanguage();
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: page.url(path),
    inLanguage: page.tag,
    name,
    isPartOf: isPartOf(),
    mainEntity: questions.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

export type FaqItem = { question: string; answer: string };

/** A guide written by the site, and the places it describes. Internal addresses are paths. */
export async function guideJsonLd({
  path,
  headline,
  description,
  published,
  modified,
  places,
}: {
  path: string;
  headline: string;
  description: string;
  published: string;
  modified: string;
  places: { name: string; url: string; internal?: boolean }[];
}): Promise<JsonLd> {
  const page = await pageLanguage();
  const url = page.url(path);
  const organization = {
    "@type": "Organization",
    "@id": organizationId(),
    name: SITE_NAME,
    url: `${siteUrl()}/`,
  };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    inLanguage: page.tag,
    headline,
    description,
    url,
    mainEntityOfPage: url,
    datePublished: published,
    dateModified: modified,
    author: organization,
    publisher: { ...organization, logo: { "@type": "ImageObject", url: `${siteUrl()}/logo.png` } },
    isPartOf: isPartOf(),
    mentions: places.map((place) => ({
      "@type": "WebSite",
      name: place.name,
      url: place.internal ? page.url(place.url) : place.url,
    })),
  };
}

/**
 * The first page of a leaderboard ranking on the home page, in rank order: by MRR, or by revenue
 * at its own address.
 */
export async function leaderboardJsonLd(
  ranked: Listing[],
  list?: { path: string; name: string },
): Promise<JsonLd> {
  const page = await pageLanguage();
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: page.url(list?.path ?? "/"),
    name: list?.name ?? page.home("explore.leaderboardTitle"),
    inLanguage: page.tag,
    isPartOf: isPartOf(),
    mainEntity: rankedList(ranked, page),
  };
}

export async function productJsonLd(item: Listing): Promise<JsonLd> {
  const page = await pageLanguage();
  const path = `/saas/${item.slug}`;
  const category = item.category ?? "Other";
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": page.url(path),
    url: page.url(path),
    inLanguage: page.tag,
    name: item.name,
    description: item.tagline,
    isPartOf: isPartOf(),
    breadcrumb: breadcrumbs(
      [
        { name: page.home("explore.browseTitle"), path: "/browse" },
        { name: page.names(categoryKey(category)), path: `/categories/${categorySlug(category)}` },
        { name: item.name ?? "SaaS", path },
      ],
      page,
    ),
    mainEntity: {
      "@type": "SoftwareApplication",
      name: item.name,
      description: item.description,
      applicationCategory: applicationCategories[category] ?? "BusinessApplication",
      applicationSubCategory: page.names(categoryKey(category)),
      url: item.website ?? page.url(path),
      image: imageUrl(item.logo_path) ?? undefined,
      datePublished: item.launched_on ?? undefined,
      creator: {
        "@type": "Person",
        name: item.owner_name,
        url: page.url(`/users/${item.owner_slug}`),
      },
    },
  };
}

export async function makerJsonLd(profile: Profile): Promise<JsonLd> {
  const page = await pageLanguage();
  const url = page.url(`/users/${profile.slug}`);
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
    inLanguage: page.tag,
    "@id": url,
    url,
    isPartOf: isPartOf(),
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

export async function categoriesJsonLd(categories: string[]): Promise<JsonLd> {
  const page = await pageLanguage();
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: page.url("/categories"),
    name: page.lists("categories.title"),
    inLanguage: page.tag,
    isPartOf: isPartOf(),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: categories.map((category, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: page.names(categoryKey(category)),
        url: page.url(`/categories/${categorySlug(category)}`),
      })),
    },
  };
}

/** A category page and its ranked products, in leaderboard order. */
export async function categoryJsonLd(category: string, ranked: Listing[]): Promise<JsonLd> {
  const page = await pageLanguage();
  const path = `/categories/${categorySlug(category)}`;
  const name = page.names(categoryKey(category));
  return rankedCollection(
    page.lists("category.title", { category: name }),
    path,
    page.lists("categories.title"),
    "/categories",
    name,
    ranked,
    page,
  );
}

/** The overview of the technologies, in the catalog's order. */
export async function techsJsonLd(items: Tech[]): Promise<JsonLd> {
  const page = await pageLanguage();
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: page.url("/tech"),
    name: page.lists("techs.title"),
    inLanguage: page.tag,
    isPartOf: isPartOf(),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items.map((tech, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: tech.name,
        url: page.url(`/tech/${tech.slug}`),
      })),
    },
  };
}

/** A technology's page and the ranked products built with it, in leaderboard order. */
export async function techJsonLd(tech: Tech, ranked: Listing[]): Promise<JsonLd> {
  const page = await pageLanguage();
  const path = `/tech/${tech.slug}`;
  return rankedCollection(
    page.lists("tech.title", { tech: tech.name }),
    path,
    page.lists("techs.title"),
    "/tech",
    tech.name,
    ranked,
    page,
  );
}

function rankedCollection(
  name: string,
  path: string,
  parentName: string,
  parentPath: string,
  crumb: string,
  ranked: Listing[],
  page: PageLanguage,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: page.url(path),
    name,
    inLanguage: page.tag,
    isPartOf: isPartOf(),
    breadcrumb: breadcrumbs(
      [
        { name: parentName, path: parentPath },
        { name: crumb, path },
      ],
      page,
    ),
    mainEntity: rankedList(ranked, page),
  };
}

/** Ranked products in leaderboard order, highest MRR first. */
function rankedList(ranked: Listing[], page: PageLanguage): JsonLd {
  return {
    "@type": "ItemList",
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: ranked.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: page.url(`/saas/${item.slug}`),
    })),
  };
}

/** JSON for a script element: `<` is escaped so the text can never close the element. */
export function serializeJsonLd(data: JsonLd) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
