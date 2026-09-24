import Link from "next/link";
import { PAGE_SIZE, type Listing } from "@/lib/data";
import { formatDate, formatUsd } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { ProductLogo } from "./avatars";
import { Button } from "./ui/button";

const columns = "md:grid-cols-[2.5rem_minmax(0,1fr)_10rem_8rem_7.5rem] md:gap-6 md:px-5";

export function Leaderboard({ items }: { items: Listing[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-surface">
      <div
        aria-hidden="true"
        className={cn(
          "hidden border-b bg-subtle py-2.5 text-xs font-medium text-muted-foreground md:grid",
          columns,
        )}
      >
        <span>#</span>
        <span>Product</span>
        <span>Category</span>
        <span className="text-right">MRR</span>
        <span className="text-right">Updated</span>
      </div>
      <ol className="divide-y">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/saas/${item.id}`}
              className={cn(
                "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors hover:bg-subtle",
                columns,
              )}
            >
              <span
                className={cn(
                  "text-sm tabular-nums",
                  item.rank && item.rank <= 3
                    ? "font-medium text-foreground"
                    : "text-faint-foreground",
                )}
              >
                <span className="sr-only">Rank </span>
                {item.rank}
              </span>
              <span className="flex min-w-0 items-center gap-3">
                <ProductLogo path={item.logo_path} name={item.name ?? "SaaS"} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {item.tagline}
                  </span>
                </span>
              </span>
              <span className="hidden truncate text-sm text-muted-foreground md:block">
                {item.category}
              </span>
              <span className="text-right">
                <span className="sr-only">MRR </span>
                <span className="font-semibold tabular-nums">{formatUsd(item.mrr_cents ?? 0)}</span>
              </span>
              <span className="hidden text-right text-sm text-muted-foreground tabular-nums md:block">
                <span className="sr-only">Updated </span>
                {formatDate(item.reported_at)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ListingCard({ item, meta }: { item: Listing; meta: "maker" | "joined" }) {
  return (
    <Link
      href={`/saas/${item.id}`}
      className="flex flex-col rounded-xl border bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <div className="flex items-center gap-3">
        <ProductLogo path={item.logo_path} name={item.name ?? "SaaS"} />
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{item.name}</h3>
          <p className="truncate text-[13px] text-muted-foreground">{item.category}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 flex-1 text-sm text-muted-foreground">{item.tagline}</p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-[13px]">
        <span className="truncate text-muted-foreground">
          {meta === "joined" ? `Joined ${formatDate(item.created_at)}` : `by ${item.owner_name}`}
        </span>
        {item.mrr_cents != null ? (
          <span className="shrink-0 font-medium tabular-nums">
            {formatUsd(item.mrr_cents)}{" "}
            <span className="font-normal text-muted-foreground">MRR</span>
          </span>
        ) : (
          <span className="shrink-0 text-muted-foreground">MRR private</span>
        )}
      </div>
    </Link>
  );
}

export function ListingGrid({ items, meta }: { items: Listing[]; meta: "maker" | "joined" }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
}: {
  page: number;
  count: number;
  href: (page: number) => string;
}) {
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, count);
  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground"
    >
      <span>
        {count <= PAGE_SIZE
          ? `${count} ${count === 1 ? "product" : "products"}`
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
