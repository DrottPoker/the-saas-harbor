import Link from "@/components/link";
import { BadgeCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_INFO } from "@/i18n/config";
import { categoryKey } from "@/i18n/names";
import { historySince, parseHistory, parseRevenueHistory } from "@/lib/charts";
import { PAGE_SIZE, type Listing } from "@/lib/data";
import { getMoney } from "@/lib/display-currency";
import { formatCount, formatMoney, type Money } from "@/lib/display-money";
import { formatDate } from "@/lib/domain";
import { revenueWindow, type Ranking } from "@/lib/revenue-figures";
import { cn } from "@/lib/utils";
import { ProductLogo } from "./avatars";
import { Badge } from "./badge";
import { Growth } from "./charts/growth";
import { Sparkline } from "./charts/sparkline";
import { DemoLogo } from "./demo-logo";
import { LocalTime } from "./local-time";
import { Button } from "./ui/button";

// Phones show the rank, the product and its figure. The category and the second figure join from
// md, the trend from lg and the verification date from xl; a hidden cell takes no track.
const columns =
  "md:grid-cols-[2.5rem_minmax(0,1fr)_8rem_8rem_7rem] md:gap-6 md:px-5 lg:grid-cols-[2.5rem_minmax(0,1fr)_9rem_6rem_8rem_7rem] xl:grid-cols-[2.5rem_minmax(0,1fr)_9rem_6rem_8rem_7rem_7.5rem]";

// Where a listing leads, and its logo. Demo products have their own pages and drawn logos.
function href(item: Listing) {
  return item.demo ? `/demo/${item.slug}` : `/saas/${item.slug}`;
}
function Logo({ item }: { item: Listing }) {
  return (
    <ProductLogo
      path={item.logo_path}
      name={item.name ?? "SaaS"}
      mark={item.demo && <DemoLogo logo={item.demo.logo} />}
    />
  );
}

/**
 * The ranking, by verified MRR or by revenue over a window. Each row also shows revenue of all
 * time, or MRR in the ranking by all time, and a trend of the figure ranked by: MRR at month end,
 * or revenue by month. With `demo`, the same table lists demo products instead: unranked, under a
 * Demo column (a Demo tag on each row on phones), and with their launch date where real products
 * show when they were verified. Their pages carry the Demo tag. Amounts are in the visitor's
 * currency; the order is the one the database ranks by, in USD.
 */
export async function Leaderboard({
  items,
  ranking = "mrr",
  demo = false,
  labelledBy,
}: {
  items: Listing[];
  ranking?: Ranking;
  demo?: boolean;
  labelledBy?: string;
}) {
  const [t, common, categories, money, locale] = await Promise.all([
    getTranslations("listings"),
    getTranslations("common"),
    getTranslations("categories"),
    getMoney(),
    getLocale(),
  ]);
  const List = demo ? "ul" : "ol";
  const span = revenueWindow(ranking);
  const figureName = span ? common(`windows.${span.ranking}.chip`) : common("mrr");
  const demoFigureName = span ? t("demoRevenue") : common("demoMrr");
  // The other headline figure: all time, unless that is the ranking.
  const second =
    ranking === "all"
      ? { name: common("mrr"), demoName: common("demoMrr"), column: "mrr_cents" as const }
      : {
          name: common("windows.all.label"),
          demoName: common("windows.all.demo"),
          column: "revenue_total_cents" as const,
        };
  return (
    <div className="overflow-hidden rounded-xl border bg-surface shadow-card">
      <div
        aria-hidden="true"
        className={cn(
          "hidden border-b bg-subtle py-2.5 text-xs font-medium text-muted-foreground md:grid",
          columns,
        )}
      >
        <span>{demo ? "" : "#"}</span>
        <span>{t("product")}</span>
        <span>{t("category")}</span>
        <span className="hidden lg:block">{t("trend")}</span>
        <span className="text-end">
          {demo ? demoFigureName : span ? figureName : common("verifiedMrr")}
        </span>
        <span className="text-end">{second.name}</span>
        <span className="hidden text-end xl:block">{demo ? t("launched") : t("verified")}</span>
      </div>
      <List className="divide-y" aria-labelledby={labelledBy}>
        {items.map((item, index) => {
          // The trend of what the list ranks by, from when the product had one.
          const history = historySince(
            span ? parseRevenueHistory(item.revenue_history) : parseHistory(item.mrr_history),
            { launchedOn: item.launched_on, listedAt: item.created_at },
          );
          const secondCents = item[second.column];
          return (
            <li key={item.id}>
              <Link
                href={href(item)}
                className={cn(
                  "grid items-center gap-3 px-4 py-3.5 transition-colors hover:bg-subtle",
                  // Demo rows have no rank, so phones give their column to the name.
                  item.demo
                    ? "grid-cols-[minmax(0,1fr)_auto]"
                    : "grid-cols-[1.75rem_minmax(0,1fr)_auto]",
                  columns,
                )}
              >
                <span
                  className={cn(
                    "text-sm tabular-nums",
                    item.demo && "hidden md:block",
                    item.rank && item.rank <= 3
                      ? "font-medium text-foreground"
                      : "text-faint-foreground",
                  )}
                >
                  {!item.demo && item.rank != null && (
                    <>
                      <span className="sr-only">{`${t("rank")} `}</span>
                      {formatCount(item.rank, money.locale)}
                    </>
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-3">
                  <Logo item={item} />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span dir="auto" className="truncate font-medium">
                        {item.name}
                      </span>
                      {/* Phones have no column headings, so each demo row says so itself. */}
                      {item.demo && <Badge className="md:hidden">{common("demo")}</Badge>}
                    </span>
                    <span dir="auto" className="block truncate text-sm text-muted-foreground">
                      {item.tagline}
                    </span>
                  </span>
                </span>
                <span className="hidden truncate text-sm text-muted-foreground md:block">
                  {categories(categoryKey(item.category))}
                </span>
                <span className="hidden lg:block">
                  {history && history.length > 1 && <Sparkline history={history} order={index} />}
                </span>
                <span className="flex flex-col items-end">
                  <span className="sr-only">{`${item.demo ? demoFigureName : figureName} `}</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney((span ? item[span.column] : item.mrr_cents) ?? 0, money)}
                  </span>
                  {!span && item.mrr_growth_pct != null && <Growth pct={item.mrr_growth_pct} />}
                </span>
                <span className="hidden text-end text-sm md:block">
                  <span className="sr-only">{`${item.demo ? second.demoName : second.name} `}</span>
                  {secondCents == null ? (
                    <span className="text-faint-foreground">{common("notShared")}</span>
                  ) : (
                    <span className="tabular-nums">{formatMoney(secondCents, money)}</span>
                  )}
                </span>
                <span className="hidden text-end text-sm text-muted-foreground tabular-nums xl:block">
                  <span className="sr-only">{`${item.demo ? t("launched") : t("verified")} `}</span>
                  {item.demo ? (
                    item.launched_on && formatDate(item.launched_on, LOCALE_INFO[locale].intl)
                  ) : item.verified_at ? (
                    <LocalTime format="date" value={item.verified_at} />
                  ) : (
                    common("notShared")
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </List>
    </div>
  );
}

async function RevenueLabel({ item, money }: { item: Listing; money: Money }) {
  const [t, common] = await Promise.all([getTranslations("listings"), getTranslations("common")]);
  const mrr = <span className="font-normal text-muted-foreground">{common("mrr")}</span>;
  // A demo figure is shown plainly, never with the verified mark.
  if (item.demo && item.mrr_cents != null)
    return (
      <span className="shrink-0 font-medium tabular-nums">
        {formatMoney(item.mrr_cents, money)} {mrr}
      </span>
    );
  if (item.revenue_status === "verified" && item.mrr_cents != null)
    return (
      <span className="flex shrink-0 items-center gap-1 font-medium tabular-nums">
        <BadgeCheck aria-label={t("verified")} className="size-3.5 text-brand" />
        {formatMoney(item.mrr_cents, money)} {mrr}
      </span>
    );
  // Visitors are not told whether a product is unverified or keeps its revenue private.
  return <span className="shrink-0 text-muted-foreground">{t("mrrNotShared")}</span>;
}

// A demo product never joined, so New arrivals shows when it launched instead.
async function CardMeta({ item, meta }: { item: Listing; meta: "maker" | "joined" }) {
  const [t, locale] = await Promise.all([getTranslations("listings"), getLocale()]);
  const by = t("byFounder", { name: item.owner_name ?? "" });
  if (meta === "maker") return by;
  if (!item.demo)
    return item.created_at
      ? t.rich("joined", { date: () => <LocalTime format="date" value={item.created_at!} /> })
      : by;
  return item.launched_on
    ? t("launchedOn", { date: formatDate(item.launched_on, LOCALE_INFO[locale].intl) })
    : by;
}

export async function ListingCard({ item, meta }: { item: Listing; meta: "maker" | "joined" }) {
  const [common, categories, money] = await Promise.all([
    getTranslations("common"),
    getTranslations("categories"),
    getMoney(),
  ]);
  return (
    <Link
      href={href(item)}
      className="flex flex-col rounded-xl border bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised"
    >
      <div className="flex items-center gap-3">
        <Logo item={item} />
        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="truncate font-semibold">
            {item.name}
          </h3>
          <p className="truncate text-[13px] text-muted-foreground">
            {categories(categoryKey(item.category))}
          </p>
        </div>
        {item.demo && <Badge className="self-start">{common("demo")}</Badge>}
      </div>
      <p dir="auto" className="mt-3 line-clamp-2 flex-1 text-sm text-muted-foreground">
        {item.tagline}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-[13px]">
        <span className="truncate text-muted-foreground">
          <CardMeta item={item} meta={meta} />
        </span>
        <RevenueLabel item={item} money={money} />
      </div>
    </Link>
  );
}

export function ListingGrid({
  items,
  meta,
  columns = 3,
}: {
  items: Listing[];
  meta: "maker" | "joined";
  columns?: 2 | 3;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3")}>
      {items.map((item) => (
        <ListingCard key={item.id} item={item} meta={meta} />
      ))}
    </div>
  );
}

export async function ResultsFooter({
  page,
  count,
  href,
  pageSize = PAGE_SIZE,
  noun,
}: {
  page: number;
  count: number;
  href: (page: number) => string;
  pageSize?: number;
  /** Singular and plural for a count that is not of products, in English (the admin panel). */
  noun?: [string, string];
}) {
  const [t, locale] = await Promise.all([getTranslations("listings.results"), getLocale()]);
  const number = (value: number) => formatCount(value, LOCALE_INFO[locale].intl);
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);
  return (
    <nav
      aria-label={t("label")}
      className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground"
    >
      <span>
        {count > pageSize
          ? t("showing", { first: number(first), last: number(last), count: number(count) })
          : noun
            ? `${count} ${count === 1 ? noun[0] : noun[1]}`
            : t("count", { count })}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>{t("previous")}</Link>
          </Button>
        )}
        {last < count && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>{t("next")}</Link>
          </Button>
        )}
      </div>
    </nav>
  );
}
