// Made-up products that fill the lists while the directory is new, so a first visitor sees what a
// listing looks like instead of an empty page. They live only here, never in the database, and are
// always marked as demos: never ranked or verified, with no maker account, website or contact. A
// list shows only as many as it needs to fill its first page after the real products, and all of
// them go once enough real products share verified MRR (demoActive in data.ts).
import type { Listing, Sort } from "./data";
import { categories, searchTerm } from "./domain";

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
export type DemoDetails = { headline: string; logo: { color: string; shape: DemoShape } };

type DemoProduct = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: (typeof categories)[number];
  maker: { name: string; headline: string };
  logo: DemoDetails["logo"];
  /** Whole dollars. Null keeps MRR private; verified: false means not verified at all. */
  mrr: number | null;
  customers: number | null;
  launched: string | null;
  verified?: false;
  /** Where the 12-month history starts, as a share of today's MRR. Above 1 means shrinking. */
  start: number;
};

const makers = {
  sara: {
    name: "Sara Lindahl",
    headline: "Former finance lead building tools for subscription businesses",
  },
  nadia: {
    name: "Nadia Brandt",
    headline: "Building support and marketing tools for small online shops",
  },
  elin: { name: "Elin Sjöberg", headline: "Platform engineer who dislikes silent failures" },
  diego: { name: "Diego Álvarez", headline: "Freelance designer building tools for freelancers" },
  tom: { name: "Tom Keller", headline: "Web developer who cares about privacy" },
  kofi: { name: "Kofi Mensah", headline: "Podcast producer turned developer" },
  anika: { name: "Anika Rao", headline: "Mobile developer making app launches easier" },
  marcus: { name: "Marcus Webb", headline: "SEO consultant for small businesses" },
  maya: { name: "Maya Brooks", headline: "Climber and software developer" },
  lucas: { name: "Lucas Moreau", headline: "Design systems engineer" },
  hana: { name: "Hana Sato", headline: "Remote team lead building calmer calendars" },
};

// The names were checked against existing products when they were chosen.
const products: DemoProduct[] = [
  {
    slug: "metricfold",
    name: "Metricfold",
    tagline: "MRR, churn and cohorts from your Stripe account, without a spreadsheet.",
    description:
      "Metricfold connects to Stripe with a read-only key and turns your subscriptions into the numbers you check every Monday: MRR, net revenue retention, churn and trial conversion. Cohort charts show how long the customers from each signup month stay.\n\nIt is built for founders and small finance teams who want the answer on one screen rather than a reporting project. Weekly email summaries, CSV exports and notes for launches and price changes come with every plan.",
    category: "Analytics",
    maker: makers.sara,
    logo: { color: "#2f4bd8", shape: "bars" },
    mrr: 38400,
    customers: 612,
    launched: "2022-02-15",
    start: 0.62,
  },
  {
    slug: "inboxwren",
    name: "Inboxwren",
    tagline: "Sorts your support inbox by urgency and drafts replies you can edit.",
    description:
      "Inboxwren reads new support emails and chat messages, tags them by topic and urgency, and drafts a reply from your help center and earlier answers. Nothing is sent until a person approves it.\n\nMost customers are online shops with two to ten people on support. They use it to answer order questions faster during sales and to catch refund requests before they turn into chargebacks.",
    category: "AI & Machine Learning",
    maker: makers.nadia,
    logo: { color: "#0f766e", shape: "tray" },
    mrr: 27950,
    customers: 418,
    launched: "2023-04-03",
    start: 0.38,
  },
  {
    slug: "cronhawk",
    name: "Cronhawk",
    tagline: "Know when a scheduled job did not run, ran late or failed.",
    description:
      "Add one line to the end of a cron job, a queue worker or a scheduled function, and Cronhawk expects it to check in on time. When it is late, fails or runs too long, the right person gets an email, a text message or a chat alert.\n\nIt started as a script for a team that lost a week of backups without noticing. Today it watches nightly backups, invoice runs and data imports for close to 900 teams, from solo developers to agencies with hundreds of servers.",
    category: "Developer Tools",
    maker: makers.elin,
    logo: { color: "#1e293b", shape: "clock" },
    mrr: 21300,
    customers: 884,
    launched: "2021-11-08",
    start: 0.86,
  },
  {
    slug: "clientloft",
    name: "Clientloft",
    tagline: "A client portal for freelancers: files, approvals and invoices behind one link.",
    description:
      "Clientloft gives each client a private page with the project's files, feedback rounds, contracts and invoices. Clients approve work with one click and never have to search their email for the latest version.\n\nDesigners, developers and small studios use it to stop chasing approvals. Pages carry your own logo and domain, and a finished project can be archived and handed over with everything in it.",
    category: "Productivity",
    maker: makers.diego,
    logo: { color: "#c2410c", shape: "house" },
    mrr: 16750,
    customers: 1237,
    launched: "2022-08-22",
    start: 0.7,
  },
  {
    slug: "retrywell",
    name: "Retrywell",
    tagline:
      "Recovers failed subscription payments with well-timed retries and friendly reminders.",
    description:
      "When a card payment fails, Retrywell tries it again at the moment it is most likely to go through, and sends short, polite reminders with a link to update the card. Most recovered payments need nothing from you.\n\nIt connects to Stripe in a few minutes and reports how much it recovered each month. Customers are subscription businesses of every size, from side projects to companies with a finance team.",
    category: "Finance",
    maker: makers.sara,
    logo: { color: "#15803d", shape: "retry" },
    mrr: 14180,
    customers: 187,
    launched: "2023-09-12",
    start: 0.5,
  },
  {
    slug: "quietstats",
    name: "Quietstats",
    tagline: "Simple website analytics without cookies or personal data.",
    description:
      "Quietstats shows visitors, pages, referrers and campaigns on a single page. It sets no cookies and stores no personal data, so visitors are never followed from site to site.\n\nThe script is under 2 KB and the dashboard loads at once. Bloggers, documentation sites and small companies use it to see what works without handing their visitors' data to an advertising network.",
    category: "Analytics",
    maker: makers.tom,
    logo: { color: "#475569", shape: "line" },
    mrr: 11820,
    customers: 2046,
    launched: "2021-05-19",
    start: 1.04,
  },
  {
    slug: "episodemint",
    name: "Episodemint",
    tagline: "Transcripts, show notes and clips from each podcast episode in minutes.",
    description:
      "Upload an episode and Episodemint writes a transcript with speaker names, chapter markers, show notes and a short list of quotable moments. You edit everything before it goes out.\n\nIt was built by a podcast producer who spent hours on show notes every week. Independent shows and small production companies use it to publish on the day they record, and to turn old episodes into searchable pages.",
    category: "AI & Machine Learning",
    maker: makers.kofi,
    logo: { color: "#be185d", shape: "wave" },
    mrr: 9640,
    customers: null,
    launched: "2024-01-29",
    start: 0.3,
  },
  {
    slug: "mockframe",
    name: "Mockframe",
    tagline: "App store screenshots from your plain captures, in every size the stores need.",
    description:
      "Drop in plain screenshots, pick a layout, and Mockframe places them in device frames with captions and backgrounds, in the sizes every store listing needs. Changing a caption updates every device size at once.\n\nMobile developers and small app studios use it before each release. Captions in up to 40 languages come from a single spreadsheet, so a new language does not mean a day of design work.",
    category: "Design",
    maker: makers.anika,
    logo: { color: "#4338ca", shape: "phone" },
    mrr: 7310,
    customers: 961,
    launched: "2023-06-07",
    start: 1.12,
  },
  {
    slug: "rankmoss",
    name: "Rankmoss",
    tagline: "Daily keyword rankings for small websites, with suggestions in plain words.",
    description:
      "Rankmoss checks every day where your pages rank for the searches you care about, on desktop and mobile, and tells you in plain words what changed and what to try next.\n\nIt is made for small businesses and freelancers who look after their own website. Reports can be shared with a client or a colleague by link, and prices stay low because it tracks hundreds of keywords rather than millions.",
    category: "Marketing",
    maker: makers.marcus,
    logo: { color: "#4d7c0f", shape: "steps" },
    mrr: 5480,
    customers: 309,
    launched: "2024-03-18",
    start: 0.55,
  },
  {
    slug: "switchmoor",
    name: "Switchmoor",
    tagline: "Feature flags and gradual rollouts for small engineering teams.",
    description:
      "Switchmoor turns a feature on for a few users, a share of traffic or a single customer, and off again without a deploy. Every change is logged with who made it and why.\n\nLibraries cover the common web and mobile stacks, flags are evaluated inside your app so they add no network delay, and the price is per team rather than per request.",
    category: "Developer Tools",
    maker: makers.elin,
    logo: { color: "#b91c1c", shape: "toggle" },
    mrr: 4120,
    customers: 142,
    launched: null,
    start: 0.25,
  },
  {
    slug: "praisenest",
    name: "Praisenest",
    tagline: "Collect testimonials from happy customers and show them on your site.",
    description:
      "Praisenest sends customers a short link where they can leave a written or video testimonial. You approve the ones you like and show them on your website with a small embed that matches your design.\n\nCourse creators, agencies and software companies use it to collect social proof without chasing customers by email. Reviews from other sites can be imported, so everything is kept in one place.",
    category: "Marketing",
    maker: makers.nadia,
    logo: { color: "#b45309", shape: "quote" },
    mrr: 2860,
    customers: 471,
    launched: "2025-01-14",
    start: 0.4,
  },
  {
    slug: "quarterpot",
    name: "Quarterpot",
    tagline: "Sets aside the right amount for taxes every time a freelancer gets paid.",
    description:
      "Quarterpot watches incoming payments and tells you how much of each one to put aside for income tax and VAT, based on where you live and what you have earned so far this year. Reminders arrive before each payment is due.\n\nIt was built for freelancers who were surprised by their first tax bill. It does not file taxes for you; it makes sure the money is there when you or your accountant do.",
    category: "Finance",
    maker: makers.diego,
    logo: { color: "#92400e", shape: "jar" },
    mrr: 2290,
    customers: 318,
    launched: "2024-11-04",
    start: 0.7,
  },
  {
    slug: "belaybook",
    name: "Belaybook",
    tagline: "Bookings, memberships and belay checks for small climbing gyms.",
    description:
      "Belaybook handles day passes, memberships, class bookings and the belay checks every gym needs to keep on record. Members book on their phone and check in with a QR code at the desk.\n\nIt was built by a climber who helped run a small bouldering gym and found the large gym systems too expensive and too complicated. About forty independent gyms use it today.",
    category: "Other",
    maker: makers.maya,
    logo: { color: "#0e7490", shape: "loop" },
    mrr: 1940,
    customers: 37,
    launched: "2024-06-10",
    start: 0.6,
  },
  {
    slug: "swatchline",
    name: "Swatchline",
    tagline: "Keeps design tokens in your design files and your code in step.",
    description:
      "Swatchline reads colors, type and spacing from your design files and opens a pull request with updated tokens for the web, iOS and Android whenever a designer publishes a change.\n\nDesign system teams use it to stop copying values by hand. Every change is reviewed like code, and a changelog shows who changed which token and when.",
    category: "Design",
    maker: makers.lucas,
    logo: { color: "#7c3aed", shape: "swatches" },
    mrr: null,
    customers: null,
    launched: "2024-08-26",
    start: 1,
  },
  {
    slug: "hourbridge",
    name: "Hourbridge",
    tagline: "Finds meeting times that are fair to everyone across time zones.",
    description:
      "Hourbridge looks at everyone's working hours and calendars and suggests meeting times that share the early and late slots fairly across the team, instead of always asking the same people to stay up.\n\nIt is built for remote teams spread over several continents. Recurring meetings rotate on their own, and each person can mark hours that must never be booked.",
    category: "Productivity",
    maker: makers.hana,
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

function toListing(product: DemoProduct, now: Date): Listing {
  const shared = product.verified !== false && product.mrr != null;
  const history = shared ? demoHistory({ ...product, mrr: product.mrr! }, now) : null;
  const mrrCents = shared ? product.mrr! * 100 : null;
  const lastMonth = history?.at(-1)?.mrr_cents;
  return {
    id: `demo-${product.slug}`,
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    description: product.description,
    category: product.category,
    website: null,
    logo_path: null,
    owner_id: null,
    owner_name: product.maker.name,
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
    rank: null,
    demo: { headline: product.maker.headline, logo: product.logo },
  };
}

/** Every demo product as a listing, with history up to the last month-end before `now`. */
export function demoListings(now = new Date()) {
  return products.map((product) => toListing(product, now));
}

const order: Record<Sort, (a: Listing, b: Listing) => number> = {
  rank: (a, b) => b.mrr_cents! - a.mrr_cents!,
  name: (a, b) => a.name!.localeCompare(b.name!, "en"),
  newest: (a, b) => (b.launched_on ?? "").localeCompare(a.launched_on ?? ""),
};

/**
 * The demo products a list shows after its real ones: those that match its filters, on a first
 * page only, and no more than `room`, the places real products leave free on that page. The
 * leaderboard takes only those that share MRR.
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
        (sort !== "rank" || item.mrr_cents != null),
    )
    .sort(order[sort])
    .slice(0, room);
}
