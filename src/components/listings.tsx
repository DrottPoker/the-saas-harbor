import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { historySince, parseHistory, parseRevenueHistory } from "@/lib/charts";
import { PAGE_SIZE, type Listing } from "@/lib/data";
import { formatDate, formatUsd } from "@/lib/domain";
import { revenueWindow, type Ranking } from "@/lib/revenue-figures";
import { cn } from "@/lib/utils";
import { ProductLogo } from "./avatars";
import { Badge } from "./badge";
import { Growth } from "./charts/growth";
import { Sparkline } from "./charts/sparkline";
import { DemoLogo } from "./demo-logo";
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
 * show when they were verified. Their pages carry the Demo tag.
 */
export function Leaderboard({
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
  const List = demo ? "ul" : "ol";
  const span = revenueWindow(ranking);
  const figureName = span ? `Revenue, ${span.short.toLowerCase()}` : "MRR";
  // The other headline figure: all time, unless that is the ranking.
  const second =
    ranking === "all"
      ? { name: "MRR", demoName: "Demo MRR", column: "mrr_cents" as const }
      : {
          name: "Revenue, all time",
          demoName: "Demo revenue, all time",
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
        <span>Product</span>
        <span>Category</span>
        <span className="hidden lg:block">12 months</span>
        <span className="text-right">
          {demo ? `Demo ${span ? "revenue" : "MRR"}` : span ? figureName : "Verified MRR"}
        </span>
        <span className="text-right">{second.name}</span>
        <span className="hidden text-right xl:block">{demo ? "Launched" : "Verified"}</span>
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
                  {!item.demo && (
                    <>
                      <span className="sr-only">Rank </span>
                      {item.rank}
                    </>
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-3">
                  <Logo item={item} />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{item.name}</span>
                      {/* Phones have no column headings, so each demo row says so itself. */}
                      {item.demo && <Badge className="md:hidden">Demo</Badge>}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {item.tagline}
                    </span>
                  </span>
                </span>
                <span className="hidden truncate text-sm text-muted-foreground md:block">
                  {item.category}
                </span>
                <span className="hidden lg:block">
                  {history && history.length > 1 && <Sparkline history={history} order={index} />}
                </span>
                <span className="flex flex-col items-end">
                  <span className="sr-only">{`${item.demo ? "Demo " : ""}${figureName} `}</span>
                  <span className="font-semibold tabular-nums">
                    {formatUsd((span ? item[span.column] : item.mrr_cents) ?? 0)}
                  </span>
                  {!span && item.mrr_growth_pct != null && <Growth pct={item.mrr_growth_pct} />}
                </span>
                <span className="hidden text-right text-sm md:block">
                  <span className="sr-only">{`${item.demo ? second.demoName : second.name} `}</span>
                  {secondCents == null ? (
                    <span className="text-faint-foreground">Not shared</span>
                  ) : (
                    <span className="tabular-nums">{formatUsd(secondCents)}</span>
                  )}
                </span>
                <span className="hidden text-right text-sm text-muted-foreground tabular-nums xl:block">
                  <span className="sr-only">{item.demo ? "Launched " : "Verified "}</span>
                  {formatDate(item.demo ? item.launched_on : item.verified_at)}
                </span>
              </Link>
            </li>
          );
        })}
      </List>
    </div>
  );
}

function RevenueLabel({ item }: { item: Listing }) {
  // A demo figure is shown plainly, never with the verified mark.
  if (item.demo && item.mrr_cents != null)
    return (
      <span className="shrink-0 font-medium tabular-nums">
        {formatUsd(item.mrr_cents)} <span className="font-normal text-muted-foreground">MRR</span>
      </span>
    );
  if (item.revenue_status === "verified" && item.mrr_cents != null)
    return (
      <span className="flex shrink-0 items-center gap-1 font-medium tabular-nums">
        <BadgeCheck aria-label="Verified" className="size-3.5 text-brand" />
        {formatUsd(item.mrr_cents)} <span className="font-normal text-muted-foreground">MRR</span>
      </span>
    );
  // Visitors are not told whether a product is unverified or keeps its revenue private.
  return <span className="shrink-0 text-muted-foreground">MRR not shared</span>;
}

// A demo product never joined, so New arrivals shows when it launched instead.
function cardMeta(item: Listing, meta: "maker" | "joined") {
  if (meta === "maker") return `by ${item.owner_name}`;
  if (!item.demo) return `Joined ${formatDate(item.created_at)}`;
  return item.launched_on ? `Launched ${formatDate(item.launched_on)}` : `by ${item.owner_name}`;
}

export function ListingCard({ item, meta }: { item: Listing; meta: "maker" | "joined" }) {
  return (
    <Link
      href={href(item)}
      className="flex flex-col rounded-xl border bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised"
    >
      <div className="flex items-center gap-3">
        <Logo item={item} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{item.name}</h3>
          <p className="truncate text-[13px] text-muted-foreground">{item.category}</p>
        </div>
        {item.demo && <Badge className="self-start">Demo</Badge>}
      </div>
      <p className="mt-3 line-clamp-2 flex-1 text-sm text-muted-foreground">{item.tagline}</p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-[13px]">
        <span className="truncate text-muted-foreground">{cardMeta(item, meta)}</span>
        <RevenueLabel item={item} />
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

export function ResultsFooter({
  page,
  count,
  href,
  pageSize = PAGE_SIZE,
  noun = ["product", "products"],
}: {
  page: number;
  count: number;
  href: (page: number) => string;
  pageSize?: number;
  /** Singular and plural, for the count. */
  noun?: [string, string];
}) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);
  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground"
    >
      <span>
        {count <= pageSize
          ? `${count} ${count === 1 ? noun[0] : noun[1]}`
          : `Showing ${first}-${last} of ${count}`}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>Previous</Link>
          </Button>
        )}
        {last < count && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>Next</Link>
          </Button>
        )}
      </div>
    </nav>
  );
}
