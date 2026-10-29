import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { categoryKey } from "@/i18n/names";
import { localePath } from "@/i18n/navigation";
import { demoRows, listings, rankSort, type Sort } from "@/lib/data";
import { categories } from "@/lib/domain";
import { safePage } from "@/lib/params";
import { rankingFrom, REVENUE_WINDOWS, revenueWindow, type Ranking } from "@/lib/revenue-figures";
import { leaderboardJsonLd } from "@/lib/structured-data";
import { techFromSlug } from "@/lib/tech";
import { cn } from "@/lib/utils";
import { ConversionNote } from "./conversion-note";
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

// The lists, with the keys of their names in home.explore. The leaderboard is the home page:
// FounderHeader opens it, and this heads the list itself.
const intro = {
  ranked: { title: "leaderboardTitle", description: "leaderboardDescription", path: "/", sort: "rank" },
  discover: { title: "browseTitle", description: "browseDescription", path: "/browse", sort: "name" },
  newest: { title: "newestTitle", description: "newestDescription", path: "/newest", sort: "newest" },
} as const satisfies Record<Mode, { title: string; description: string; path: string; sort: Sort }>; // prettier-ignore

// Browse and New arrivals list the same products, so each offers the other as an order.
const ORDERS = [
  { mode: "discover", label: "aToZ" },
  { mode: "newest", label: "newest" },
] as const;

// The leaderboard's rankings, in the order the choice shows them.
const RANKINGS: Ranking[] = ["mrr", ...REVENUE_WINDOWS.map(({ ranking }) => ranking)];

export async function Explore({
  mode,
  params,
}: {
  mode: Mode;
  params: Record<string, string | undefined>;
}) {
  const [t, common, home, categoryNames] = await Promise.all([
    getTranslations("home.explore"),
    getTranslations("common"),
    getTranslations("home.meta"),
    getTranslations("categories"),
  ]);
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
  const { path } = intro[mode];
  const searchPath = await localePath(path);
  const title = t(intro[mode].title);
  const sort = ranked ? rankSort(ranking) : intro[mode].sort;
  // What the leaderboard says it ranks by.
  const description = !revenue
    ? t(intro[mode].description)
    : revenue.ranking === "all"
      ? t("revenueDescriptionAll")
      : t("revenueDescription", { window: home(`window${revenue.ranking}`) });
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
    <form action={searchPath} role="search" className="relative w-full sm:w-64">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-faint-foreground"
      />
      <input
        name="q"
        type="search"
        aria-label={t("searchLabel")}
        placeholder={t("searchPlaceholder")}
        defaultValue={search}
        className={cn(fieldClasses, "h-9 ps-9")}
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
            revenue
              ? { path: `/?by=${ranking}`, name: common(`windows.${revenue.ranking}.title`) }
              : undefined,
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
        <nav aria-label={t("rankBy")} className={cn(categoryChipRow, "items-center")}>
          <span className="shrink-0 pe-1 text-[13px] text-muted-foreground">{t("rankBy")}</span>
          {RANKINGS.map((item) => (
            <Link
              key={item}
              href={url({ ranking: item })}
              aria-current={ranking === item ? "page" : undefined}
              className={categoryChip}
            >
              {item === "mrr" ? common("mrr") : common(`windows.${item}.chip`)}
            </Link>
          ))}
        </nav>
      ) : (
        !tech && (
          <nav aria-label={t("order")} className={cn(categoryChipRow, "items-center")}>
            <span className="shrink-0 pe-1 text-[13px] text-muted-foreground">{t("order")}</span>
            {ORDERS.map((item) => (
              <Link
                key={item.mode}
                href={url({ mode: item.mode })}
                aria-current={mode === item.mode ? "page" : undefined}
                className={categoryChip}
              >
                {t(item.label)}
              </Link>
            ))}
          </nav>
        )
      )}
      <nav aria-label={t("categoriesLabel")} className={categoryChipRow}>
        {["", ...categories].map((item) => (
          <Link
            key={item || "all"}
            href={url({ category: item })}
            aria-current={category === item ? "page" : undefined}
            className={categoryChip}
          >
            {item ? categoryNames(categoryKey(item)) : categoryNames("all")}
          </Link>
        ))}
      </nav>
      {tech && (
        <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {t.rich("builtWith", {
              tech: () => (
                <Link
                  href={`/tech/${tech.slug}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {tech.name}
                </Link>
              ),
            })}
          </span>
          <Link
            href={url({ tech: "" })}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {t("showAllTech")}
          </Link>
        </p>
      )}

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !rows.length && !demo.length ? (
        filtered ? (
          <EmptyState
            title={t("noMatches")}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={url({ category: "", tech: "", search: "" })}>{t("clearFilters")}</Link>
              </Button>
            }
          >
            {t("noMatchesHint")}
          </EmptyState>
        ) : (
          <EmptyState
            title={ranked ? t(byRevenue ? "noRevenueYet" : "noMrrYet") : t("noProductsYet")}
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/saas/new">{t("listYourSaas")}</Link>
              </Button>
            }
          >
            {ranked ? t(byRevenue ? "emptyRevenue" : "emptyMrr") : t("beFirst")}
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
                  {t("demoTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("demoBody")}</p>
              </div>
              {ranked ? (
                <Leaderboard items={demo} ranking={ranking} demo labelledBy="demo-products" />
              ) : (
                <ListingGrid items={demo} meta={meta} />
              )}
            </section>
          )}
          <ConversionNote ranked={ranked && !!rows.length} className="mt-4" />
        </>
      )}

      {ranked && (
        <p className="mt-8 max-w-2xl text-[13px] text-faint-foreground">
          {t(byRevenue ? "footnoteRevenue" : "footnoteMrr")} {t("footnoteRules")}{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
            {t("howRankingWorks")}
          </Link>
        </p>
      )}
    </Shell>
  );
}
