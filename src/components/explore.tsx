import Link from "next/link";
import { Search } from "lucide-react";
import { demoRows, listings, safePage, type Sort } from "@/lib/data";
import { categories } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { FounderHeader } from "./founder-header";
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
    path: "/discover",
    sort: "name",
  },
  newest: {
    title: "New arrivals",
    description: "The latest products to join, newest first.",
    path: "/newest",
    sort: "newest",
  },
};

export async function Explore({
  mode,
  params,
}: {
  mode: Mode;
  params: Record<string, string | undefined>;
}) {
  const ranked = mode === "ranked";
  const category = categories.includes(params.category as (typeof categories)[number])
    ? params.category!
    : "";
  const page = safePage(params.page);
  const search = (params.q ?? "").slice(0, 80);
  const { title, description, path, sort } = intro[mode];
  const { rows, count, error } = await listings({ sort, category, page, search });
  const demo = error ? [] : await demoRows({ sort, category, search, page, count });
  const meta = mode === "newest" ? "joined" : "maker";
  const filtered = !!category || !!search || page > 1;
  function url(nextCategory: string, nextPage = 1) {
    const query = new URLSearchParams();
    if (nextCategory) query.set("category", nextCategory);
    if (search) query.set("q", search);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `${path}${query.size ? `?${query}` : ""}`;
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
      {category && <input type="hidden" name="category" value={category} />}
    </form>
  );

  return (
    <Shell>
      {ranked ? (
        <>
          {/* Only the whole leaderboard's count says which place is open. */}
          <FounderHeader ranked={filtered || error ? null : count} />
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

      <nav aria-label="Categories" className={categoryChipRow}>
        {["", ...categories].map((item) => (
          <Link
            key={item || "all"}
            href={url(item)}
            aria-current={category === item ? "page" : undefined}
            className={categoryChip}
          >
            {item || "All categories"}
          </Link>
        ))}
      </nav>

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !rows.length && !demo.length ? (
        filtered ? (
          <EmptyState
            title="No matching products"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={path}>Clear filters</Link>
              </Button>
            }
          >
            Try another category or search term.
          </EmptyState>
        ) : (
          <EmptyState
            title={ranked ? "No revenue shared yet" : "No products yet"}
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/saas/new">List your SaaS</Link>
              </Button>
            }
          >
            {ranked
              ? "Products appear here once their founder connects a payment provider and shares verified MRR."
              : "Be the first to list a product."}
          </EmptyState>
        )
      ) : (
        <>
          {!!rows.length && (
            <>
              {ranked ? <Leaderboard items={rows} /> : <ListingGrid items={rows} meta={meta} />}
              <ResultsFooter page={page} count={count} href={(next) => url(category, next)} />
            </>
          )}
          {!!demo.length && (
            <section aria-labelledby="demo-products" className={cn(!!rows.length && "mt-10")}>
              {/* The owner wants no visible heading here; each demo page carries the Demo tag. */}
              <h2 id="demo-products" className="sr-only">
                Demo products
              </h2>
              {ranked ? (
                <Leaderboard items={demo} demo labelledBy="demo-products" />
              ) : (
                <ListingGrid items={demo} meta={meta} />
              )}
            </section>
          )}
        </>
      )}

      {ranked && (
        <p className="mt-8 max-w-2xl text-[13px] text-faint-foreground">
          MRR is read from each product&apos;s subscriptions through a read-only key to its payment
          provider and refreshed every hour. Figures older than seven days are not ranked. Equal
          amounts are ordered by the date the product was listed.{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
            How the ranking works
          </Link>
        </p>
      )}
    </Shell>
  );
}
