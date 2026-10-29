// Made-up products that fill the lists while the directory is new, so a first visitor sees what a
// listing looks like instead of an empty page. They live only here, never in the database, and are
// always marked as demos: never ranked or verified, with no maker account, website or contact. A
// list shows only as many as it needs to fill its first page after the real products, and all of
// them go once enough real products share verified MRR (demoActive in data.ts). Their taglines,
// descriptions and founder headlines are messages (product.demo), so they read in every language.
import { getTranslations } from "next-intl/server";
import english from "@/messages/en/product.json";
import type { Listing, Sort } from "./data";
import { categories, searchTerm } from "./domain";

type DemoSlug = keyof typeof english.demo.products;
type DemoFounder = keyof typeof english.demo.founders;

/** Logo artwork, drawn by src/components/demo-logo.tsx. */
export type DemoShape =
  | "bars"
  | "tray"
  | "clock"
  | "house"
  | "retry"
  | "line"
  | "wave"
  | "phone"
  | "steps"
  | "toggle"
  | "quote"
  | "jar"
  | "loop"
  | "swatches"
  | "calendar";
export type DemoDetails = {
  headline: string;
  founder: DemoFounder;
  logo: { color: string; shape: DemoShape };
};

type DemoProduct = {
  /** Also the key of its tagline and description in product.demo.products. */
  slug: DemoSlug;
  name: string;
  category: (typeof categories)[number];
  maker: DemoFounder;
  logo: DemoDetails["logo"];
  /** Whole dollars. Null keeps MRR private; verified: false means not verified at all. */
  mrr: number | null;
  customers: number | null;
  /** Null reads Not shared, as for a founder who hides their launch date. */
  launched: string | null;
  verified?: false;
  /** Where the 12-month history starts, as a share of today's MRR. Above 1 means shrinking. */
  start: number;
};

// The founders' names; their headlines are in product.demo.founders.
const makers: Record<DemoFounder, string> = {
  sara: "Sara Lindahl",
  nadia: "Nadia Brandt",
  elin: "Elin Sjöberg",
  diego: "Diego Álvarez",
  tom: "Tom Keller",
  kofi: "Kofi Mensah",
  anika: "Anika Rao",
  marcus: "Marcus Webb",
  maya: "Maya Brooks",
  lucas: "Lucas Moreau",
  hana: "Hana Sato",
};

// The names were checked against existing products when they were chosen.
const products: DemoProduct[] = [
  {
    slug: "metricfold",
    name: "Metricfold",
    category: "Analytics",
    maker: "sara",
    logo: { color: "#2f4bd8", shape: "bars" },
    mrr: 38400,
    customers: 612,
    launched: "2022-02-15",
    start: 0.62,
  },
  {
    slug: "inboxwren",
    name: "Inboxwren",
    category: "AI & Machine Learning",
    maker: "nadia",
    logo: { color: "#0f766e", shape: "tray" },
    mrr: 27950,
    customers: 418,
    launched: "2023-04-03",
    start: 0.38,
  },
  {
    slug: "cronhawk",
    name: "Cronhawk",
    category: "Developer Tools",
    maker: "elin",
    logo: { color: "#1e293b", shape: "clock" },
    mrr: 21300,
    customers: 884,
    launched: "2021-11-08",
    start: 0.86,
  },
  {
    slug: "clientloft",
    name: "Clientloft",
    category: "Productivity",
    maker: "diego",
    logo: { color: "#c2410c", shape: "house" },
    mrr: 16750,
    customers: 1237,
    launched: "2022-08-22",
    start: 0.7,
  },
  {
    slug: "retrywell",
    name: "Retrywell",
    category: "Finance",
    maker: "sara",
    logo: { color: "#15803d", shape: "retry" },
    mrr: 14180,
    customers: 187,
    launched: "2023-09-12",
    start: 0.5,
  },
  {
    slug: "quietstats",
    name: "Quietstats",
    category: "Analytics",
    maker: "tom",
    logo: { color: "#475569", shape: "line" },
    mrr: 11820,
    customers: 2046,
    launched: "2021-05-19",
    start: 1.04,
  },
  {
    slug: "episodemint",
    name: "Episodemint",
    category: "AI & Machine Learning",
    maker: "kofi",
    logo: { color: "#be185d", shape: "wave" },
    mrr: 9640,
    customers: null,
    launched: "2024-01-29",
    start: 0.3,
  },
  {
    slug: "mockframe",
    name: "Mockframe",
    category: "Design",
    maker: "anika",
    logo: { color: "#4338ca", shape: "phone" },
    mrr: 7310,
    customers: 961,
    launched: "2023-06-07",
    start: 1.12,
  },
  {
    slug: "rankmoss",
    name: "Rankmoss",
    category: "Marketing",
    maker: "marcus",
    logo: { color: "#4d7c0f", shape: "steps" },
    mrr: 5480,
    customers: 309,
    launched: "2024-03-18",
    start: 0.55,
  },
  {
    slug: "switchmoor",
    name: "Switchmoor",
    category: "Developer Tools",
    maker: "elin",
    logo: { color: "#b91c1c", shape: "toggle" },
    mrr: 4120,
    customers: 142,
    launched: null,
    start: 0.25,
  },
  {
    slug: "praisenest",
    name: "Praisenest",
    category: "Marketing",
    maker: "nadia",
    logo: { color: "#b45309", shape: "quote" },
    mrr: 2860,
    customers: 471,
    launched: "2025-01-14",
    start: 0.4,
  },
  {
    slug: "quarterpot",
    name: "Quarterpot",
    category: "Finance",
    maker: "diego",
    logo: { color: "#92400e", shape: "jar" },
    mrr: 2290,
    customers: 318,
    launched: "2024-11-04",
    start: 0.7,
  },
  {
    slug: "belaybook",
    name: "Belaybook",
    category: "Other",
    maker: "maya",
    logo: { color: "#0e7490", shape: "loop" },
    mrr: 1940,
    customers: 37,
    launched: "2024-06-10",
    start: 0.6,
  },
  {
    slug: "swatchline",
    name: "Swatchline",
    category: "Design",
    maker: "lucas",
    logo: { color: "#7c3aed", shape: "swatches" },
    mrr: null,
    customers: null,
    launched: "2024-08-26",
    start: 1,
  },
  {
    slug: "hourbridge",
    name: "Hourbridge",
    category: "Productivity",
    maker: "hana",
    logo: { color: "#0369a1", shape: "calendar" },
    mrr: null,
    customers: null,
    launched: "2025-03-03",
    verified: false,
    start: 1,
  },
];

// FNV-1a: a small, stable number per product for the history's variation.
function unit(text: string) {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 2 ** 32;
}

/**
 * Twelve month-ends up to the last one before `now`, moving from `start` toward today's MRR with a
 * little variation, in the shape stored for real products (see src/lib/revenue/history.ts).
 */
export function demoHistory(product: { slug: string; mrr: number; start: number }, now: Date) {
  const seed = unit(product.slug);
  const points: { month: string; mrr_cents: number }[] = [];
  for (let back = 12; back >= 1; back--) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0));
    const share = product.start + (1 - product.start) * ((13 - back) / 13) ** 1.4;
    const noise = 1 + 0.02 * Math.sin(seed * 40 + back * 1.9);
    points.push({
      month: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`,
      mrr_cents: Math.round(product.mrr * 100 * share * noise),
    });
  }
  return points;
}

/**
 * Made-up revenue besides MRR: each month of the history its month-end MRR from subscriptions and
 * a varying few percent more from one-time sales, the last 30 days a little above MRR, the last 12
 * months the sum of the months, and all time as much again for every year before, fading toward
 * the launch. Counted from the start of the month, so it stays the same all month, as the history
 * does.
 */
export function demoRevenue(
  product: { slug: string; launched: string | null },
  history: { month: string; mrr_cents: number }[],
  mrrCents: number,
  now: Date,
) {
  const extra = 0.04 + 0.08 * unit(`${product.slug}:once`);
  // Whole dollars, like the made-up MRR.
  const dollars = (cents: number) => Math.round(cents / 100) * 100;
  const months = history.map(({ month, mrr_cents }) => {
    const subscription = dollars(mrr_cents);
    const oneTime = dollars(mrr_cents * extra * (0.4 + 1.2 * unit(`${product.slug}:${month}`)));
    return {
      month,
      cents: subscription + oneTime,
      subscription_cents: subscription,
      one_time_cents: oneTime,
    };
  });
  const year = months.reduce((sum, month) => sum + month.cents, 0);
  const month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const launched = product.launched ? Date.parse(product.launched) : month;
  const earlierYears = Math.max(0, (month - launched) / (365.25 * 86_400_000) - 1);
  return {
    revenue_30d_cents: dollars(mrrCents * (1 + extra)),
    revenue_12m_cents: year,
    revenue_total_cents: dollars(year * (1 + earlierYears * 0.6)),
    revenue_history: months,
  };
}

function toListing(product: DemoProduct, now: Date): Listing {
  const shared = product.verified !== false && product.mrr != null;
  const history = shared ? demoHistory({ ...product, mrr: product.mrr! }, now) : null;
  const mrrCents = shared ? product.mrr! * 100 : null;
  const lastMonth = history?.at(-1)?.mrr_cents;
  const revenue =
    history && mrrCents != null
      ? demoRevenue(product, history, mrrCents, now)
      : {
          revenue_30d_cents: null,
          revenue_12m_cents: null,
          revenue_total_cents: null,
          revenue_history: null,
        };
  const text = english.demo.products[product.slug];
  return {
    id: `demo-${product.slug}`,
    slug: product.slug,
    name: product.name,
    tagline: text.tagline,
    description: text.description,
    category: product.category,
    website: null,
    logo_path: null,
    owner_id: null,
    owner_name: makers[product.maker],
    owner_slug: null,
    owner_avatar_path: null,
    created_at: null,
    updated_at: null,
    mrr_cents: mrrCents,
    customers: product.verified === false ? null : product.customers,
    launched_on: product.launched,
    verified_at: null,
    livemode: null,
    provider: null,
    // Technology pages list real products only, so demo products name no stack.
    tech_stack: null,
    verified_domain: null,
    domain_verified_at: null,
    // Never "verified": a demo figure must not read as one anywhere.
    revenue_status: product.verified === false ? "unverified" : shared ? "demo" : "private",
    mrr_history: history,
    mrr_growth_pct:
      mrrCents != null && lastMonth
        ? Math.round(((mrrCents - lastMonth) / lastMonth) * 1000) / 10
        : null,
    ...revenue,
    rank: null,
    demo: {
      headline: english.demo.founders[product.maker],
      founder: product.maker,
      logo: product.logo,
    },
  };
}

/** Every demo product as a listing, in English, with history up to the last month-end before `now`. */
export function demoListings(now = new Date()) {
  return products.map((product) => toListing(product, now));
}

function isDemoSlug(slug: string | null): slug is DemoSlug {
  return !!slug && Object.hasOwn(english.demo.products, slug);
}

/**
 * Demo listings with their tagline, description and founder headline in the page's language. Real
 * listings pass through unchanged.
 */
export async function translateDemos(items: Listing[]): Promise<Listing[]> {
  if (!items.some((item) => item.demo)) return items;
  const t = await getTranslations("product.demo");
  return items.map((item) => {
    if (!item.demo || !isDemoSlug(item.slug)) return item;
    return {
      ...item,
      tagline: t(`products.${item.slug}.tagline`),
      description: t(`products.${item.slug}.description`),
      demo: { ...item.demo, headline: t(`founders.${item.demo.founder}`) },
    };
  });
}

// The figure each ranking orders by, which a demo product needs to be in it.
const RANKED: Partial<Record<Sort, keyof Listing>> = {
  rank: "mrr_cents",
  "revenue-30d": "revenue_30d_cents",
  "revenue-12m": "revenue_12m_cents",
  "revenue-all": "revenue_total_cents",
};
const figure = (item: Listing, sort: Sort) => item[RANKED[sort]!] as number;
const byFigure = (sort: Sort) => (a: Listing, b: Listing) => figure(b, sort) - figure(a, sort);

const order: Record<Sort, (a: Listing, b: Listing) => number> = {
  rank: byFigure("rank"),
  "revenue-30d": byFigure("revenue-30d"),
  "revenue-12m": byFigure("revenue-12m"),
  "revenue-all": byFigure("revenue-all"),
  name: (a, b) => a.name!.localeCompare(b.name!, "en"),
  newest: (a, b) => (b.launched_on ?? "").localeCompare(a.launched_on ?? ""),
};

/**
 * The demo products a list shows after its real ones: those that match its filters, on a first
 * page only, and no more than `room`, the places real products leave free on that page. A
 * ranking takes only those that share its figure.
 */
export function demoFill(
  items: Listing[],
  {
    sort,
    category,
    search,
    page,
    room,
  }: { sort: Sort; category: string; search: string; page: number; room: number },
) {
  if (page !== 1 || room <= 0) return [];
  const term = searchTerm(search).toLowerCase();
  return items
    .filter(
      (item) =>
        (!category || item.category === category) &&
        (!term || item.name!.toLowerCase().includes(term)) &&
        (!RANKED[sort] || item[RANKED[sort]] != null),
    )
    .sort(order[sort])
    .slice(0, room);
}
