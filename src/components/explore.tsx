import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { demoRows, listings, rankSort, type Sort } from "@/lib/data";
import { categories } from "@/lib/domain";
import { safePage } from "@/lib/params";
import {
  rankingFrom,
  revenueRankingTitle,
  REVENUE_WINDOWS,
  revenueWindow,
  type Ranking,
} from "@/lib/revenue-figures";
import { leaderboardJsonLd } from "@/lib/structured-data";
import { techFromSlug } from "@/lib/tech";
import { cn } from "@/lib/utils";
import { FounderHeader } from "./founder-header";
import { JsonLd } from "./json-ld";
import { Leaderboard, ListingGrid, ResultsFooter } from "./listings";
import { EmptyState, Notice, PageHeader, Shell } from "./shell";
import { Button } from "./ui/button";
import { fieldClasses } from "./ui/input";

type Mode = "ranked" | "discover" | "newest";

/** A category link in a row of chips; `aria-current="page"` marks the chosen one. */
export const categoryChip =
  "shrink-0 rounded-full border bg-surface px-3 py-1 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background";
export const categoryChipRow =
  "-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0 lg:pb-0";

const intro: Record<Mode, { title: string; description: string; path: string; sort: Sort }> = {
  // The leaderboard is the home page: FounderHeader opens it, and this heads the list itself.
  ranked: {
    title: "Leaderboard",
    description:
      "Ranked by monthly recurring revenue, verified through each product's payment provider.",
    path: "/",
    sort: "rank",
  },
  discover: {
    title: "Browse SaaS",
    description: "Every product listed here, A to Z, including those that keep revenue private.",
    path: "/browse",
    sort: "name",
  },
  newest: {
    title: "New arrivals",
    description: "The latest products to join, newest first.",
    path: "/newest",
    sort: "newest",
  },
};

// Browse and New arrivals list the same products, so each offers the other as an order.
const ORDERS: { mode: Mode; label: string }[] = [
  { mode: "discover", label: "A to Z" },
  { mode: "newest", label: "Newest" },
];

// The leaderboard's rankings, in the order the choice shows them.
const RANKINGS: { ranking: Ranking; label: string }[] = [
  { ranking: "mrr", label: "MRR" },
  ...REVENUE_WINDOWS.map(({ ranking, short }) => ({
    ranking,
    label: `Revenue, ${short.toLowerCase()}`,
  })),
];

/** What the leaderboard says it ranks by. */
function rankedDescription(ranking: Ranking) {
  const revenue = revenueWindow(ranking);
  if (!revenue) return intro.ranked.description;
  const span =
    revenue.ranking === "all" ? "since the first payment" : `in the last ${revenue.short}`;
  return `Ranked by revenue ${span}, one-time purchases included, verified through each product's payment provider.`;
}

export async function Explore({
  mode,
  params,
}: {
  mode: Mode;
  params: Record<string, string | undefined>;
}) {
  const ranked = mode === "ranked";
  const ranking = ranked ? rankingFrom(params.by) : "mrr";
  const revenue = revenueWindow(ranking);
  const byRevenue = !!revenue;
  const category = categories.includes(params.category as (typeof categories)[number])
    ? params.category!
    : "";
  // Technology pages (/tech/<slug>) link here for their full lists.
  const tech = techFromSlug(params.tech ?? "");
  const page = safePage(params.page);
  const search = (params.q ?? "").slice(0, 80);
  const { title, path } = intro[mode];
  const sort = ranked ? rankSort(ranking) : intro[mode].sort;
  const description = ranked ? rankedDescription(ranking) : intro[mode].description;
  const { rows, count, error } = await listings({
    sort,
    category,
    page,
    search,
    tech: tech?.slug,
  });
  // A page past the last one does not exist, so it answers 404 and search engines drop it.
  if (page > 1 && !error && !rows.length) notFound();
  // Demo products name no technologies, so a technology filter leaves them out.
  const demo = error || tech ? [] : await demoRows({ sort, category, search, page, count });
  const meta = mode === "newest" ? "joined" : "maker";
  const filtered = !!category || !!search || !!tech || page > 1;
  // An address of this list that changes only what a link names: the ranking, the category, the
  // technology, the search or the page. Every other choice stays, and the page starts at one.
  function url(
    change: {
      ranking?: Ranking;
      category?: string;
      tech?: string;
      search?: string;
      page?: number;
      mode?: Mode;
    } = {},
  ) {
    const next = {
      ranking,
      category,
      tech: tech?.slug ?? "",
      search,
      page: 1,
      mode,
      ...change,
    };
    const query = new URLSearchParams();
    if (next.ranking !== "mrr") query.set("by", next.ranking);
    if (next.category) query.set("category", next.category);
    if (next.tech) query.set("tech", next.tech);
    if (next.search) query.set("q", next.search);
    if (next.page > 1) query.set("page", String(next.page));
    return `${intro[next.mode].path}${query.size ? `?${query}` : ""}`;
  }

  const searchForm = (
    <form action={path} role="search" className="relative w-full sm:w-64">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint-foreground"
      />
      <input
        name="q"
        type="search"
        aria-label="Search products by name"
        placeholder="Search products"
        defaultValue={search}
        className={cn(fieldClasses, "h-9 pl-9")}
      />
      {byRevenue && <input type="hidden" name="by" value={ranking} />}
      {category && <input type="hidden" name="category" value={category} />}
      {tech && <input type="hidden" name="tech" value={tech.slug} />}
    </form>
  );

  return (
    <Shell>
      {/* Search engines and AI assistants read each ranking's plain first page as a list. */}
      {ranked && !filtered && !!rows.length && (
        <JsonLd
          data={leaderboardJsonLd(
            rows,
            revenue ? { path: `/?by=${ranking}`, name: revenueRankingTitle(revenue) } : undefined,
          )}
        />
      )}
      {ranked ? (
        <>
          <FounderHeader />
          <div className="flex flex-col gap-3 border-t pt-6 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="flex shrink-0 max-sm:w-full">{searchForm}</div>
          </div>
        </>
      ) : (
        <PageHeader title={title} description={description} actions={searchForm} />
      )}

      {ranked ? (
        <nav aria-label="Rank by" className={cn(categoryChipRow, "items-center")}>
          <span className="shrink-0 pr-1 text-[13px] text-muted-foreground">Rank by</span>
          {RANKINGS.map((item) => (
            <Link
              key={item.ranking}
              href={url({ ranking: item.ranking })}
              aria-current={ranking === item.ranking ? "page" : undefined}
              className={categoryChip}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : (
        !tech && (
          <nav aria-label="Order" className={cn(categoryChipRow, "items-center")}>
            <span className="shrink-0 pr-1 text-[13px] text-muted-foreground">Order</span>
            {ORDERS.map((item) => (
              <Link
                key={item.mode}
                href={url({ mode: item.mode })}
                aria-current={mode === item.mode ? "page" : undefined}
                className={categoryChip}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )
      )}
      <nav aria-label="Categories" className={categoryChipRow}>
        {["", ...categories].map((item) => (
          <Link
            key={item || "all"}
            href={url({ category: item })}
            aria-current={category === item ? "page" : undefined}
            className={categoryChip}
          >
            {item || "All categories"}
          </Link>
        ))}
      </nav>
      {tech && (
        <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            Built with{" "}
            <Link
              href={`/tech/${tech.slug}`}
              className="font-medium text-foreground hover:underline"
            >
              {tech.name}
            </Link>
          </span>
          <Link
            href={url({ tech: "" })}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Show all technologies
          </Link>
        </p>
      )}

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !rows.length && !demo.length ? (
        filtered ? (
          <EmptyState
            title="No matching products"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={url({ category: "", tech: "", search: "" })}>Clear filters</Link>
              </Button>
            }
          >
            Try another category, technology or search term.
          </EmptyState>
        ) : (
          <EmptyState
            title={ranked ? `No ${byRevenue ? "revenue" : "MRR"} shared yet` : "No products yet"}
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/saas/new">List your SaaS</Link>
              </Button>
            }
          >
            {ranked
              ? `Products appear here once their founder connects a payment provider and shares verified ${byRevenue ? "revenue" : "MRR"}.`
              : "Be the first to list a product."}
          </EmptyState>
        )
      ) : (
        <>
          {!!rows.length && (
            <>
              {ranked ? (
                <Leaderboard items={rows} ranking={ranking} />
              ) : (
                <ListingGrid items={rows} meta={meta} />
              )}
              <ResultsFooter page={page} count={count} href={(next) => url({ page: next })} />
            </>
          )}
          {!!demo.length && (
            <section aria-labelledby="demo-products" className={cn(!!rows.length && "mt-10")}>
              {/* Visible, so the made-up figures are never read as real ones (2026-10-04). */}
              <div className="mb-4">
                <h2 id="demo-products" className="text-lg font-semibold tracking-tight">
                  Demo products
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Made-up examples that show what a listing looks like. They are never ranked and
                  leave as real products join.
                </p>
              </div>
              {ranked ? (
                <Leaderboard items={demo} ranking={ranking} demo labelledBy="demo-products" />
              ) : (
                <ListingGrid items={demo} meta={meta} />
              )}
            </section>
          )}
        </>
      )}

      {ranked && (
        <p className="mt-8 max-w-2xl text-[13px] text-faint-foreground">
          {byRevenue
            ? "Revenue is every payment a product received, one-time purchases included, after refunds and without tax. It is read through a read-only key to the product's payment provider and refreshed every day."
            : "MRR is read from each product's subscriptions through a read-only key to its payment provider and refreshed every hour."}{" "}
          Figures older than seven days are not ranked. Equal amounts are ordered by revenue of all
          time, then by the date the product was listed.{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
            How the ranking works
          </Link>
        </p>
      )}
    </Shell>
  );
}
