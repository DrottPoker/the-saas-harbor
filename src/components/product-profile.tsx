import Link from "next/link";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { parseHistory } from "@/lib/charts";
import type { Listing, PageViewCounts } from "@/lib/data";
import { categorySlug, formatDate, formatUsd } from "@/lib/domain";
import { REVENUE_WINDOWS, sharesRevenue } from "@/lib/revenue-figures";
import { providerName } from "@/lib/revenue/catalog";
import { websiteRel } from "@/lib/seo";
import { PersonAvatar, ProductLogo } from "./avatars";
import { Badge } from "./badge";
import { Growth } from "./charts/growth";
import { RevenueHistory } from "./charts/revenue-history";
import { DemoLogo } from "./demo-logo";
import { SendMessageButton } from "./messages/send-message-button";
import { Metric } from "./metric";
import { ReportLink } from "./report-link";
import { Shell } from "./shell";
import { TechStack } from "./tech-stack";
import { Button } from "./ui/button";

function hostname(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** How often the page was viewed, shown to the founder only. */
function ViewCounts({ views }: { views: PageViewCounts }) {
  const periods = [
    ["Last 7 days", views.last_7_days],
    ["Last 30 days", views.last_30_days],
    ["All time", views.all_time],
  ] as const;
  return (
    <section aria-labelledby="page-views" className="rounded-xl border bg-surface p-5 shadow-card">
      <h2 id="page-views" className="text-sm text-muted-foreground">
        Page views
      </h2>
      <dl className="mt-3 grid gap-3 text-sm">
        {periods.map(([label, count]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{count.toLocaleString("en-US")}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[13px] text-muted-foreground">
        Only you can see this. Your own visits are not counted.
      </p>
    </section>
  );
}

/**
 * A product's public page. A demo product (`item.demo`) says that it is made up, and has no maker
 * profile, website, messages or reports. `views` is set for the product's founder only.
 */
export function ProductProfile({
  item,
  headline,
  viewerId,
  views = null,
}: {
  item: Listing;
  /** The maker's headline. */
  headline: string | null;
  viewerId: string | null;
  views?: PageViewCounts | null;
}) {
  const demo = item.demo;
  const name = item.name ?? "SaaS";
  const site = hostname(item.website);
  // Public reads carry only figures that are verified and shared; the rest read Not shared.
  const revenueShared = sharesRevenue(item);
  const verified =
    (item.revenue_status === "verified" && item.mrr_cents != null) || (!demo && revenueShared);
  const history = parseHistory(item.mrr_history);
  // Category pages list real products only, so demo products link to the filtered Browse list.
  const categoryHref = demo
    ? `/discover?category=${encodeURIComponent(item.category ?? "")}`
    : `/categories/${categorySlug(item.category ?? "Other")}`;
  const title = (
    <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{name}</h1>
  );
  const maker = (
    <>
      <PersonAvatar path={item.owner_avatar_path} name={item.owner_name ?? "Founder"} />
      <span className="min-w-0">
        <span className="block font-medium group-hover:underline">{item.owner_name}</span>
        {headline && <span className="line-clamp-2 text-sm text-muted-foreground">{headline}</span>}
      </span>
    </>
  );

  return (
    <Shell className="pt-6 sm:pt-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/discover" className="hover:text-foreground">
          Browse
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        {!demo && item.category && (
          <>
            <Link href={categoryHref} className="hover:text-foreground">
              {item.category}
            </Link>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
          </>
        )}
        <span className="text-foreground [overflow-wrap:anywhere]">{name}</span>
      </nav>

      {/* Name, status, actions and key figures in one card. Visitors are never told that
          revenue is unverified: a figure without a current verification reads Not shared, like
          one the founder keeps private. */}
      <header className="overflow-hidden rounded-xl border bg-surface shadow-card">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
          <ProductLogo
            path={item.logo_path}
            name={name}
            size="lg"
            mark={demo && <DemoLogo logo={demo.logo} />}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {title}
              {demo && <Badge>Demo</Badge>}
              {verified && (
                <Badge tone="accent" className="gap-1">
                  <BadgeCheck aria-hidden="true" className="size-3.5" />
                  Verified revenue
                </Badge>
              )}
              {!demo && item.verified_domain && (
                <Badge className="gap-1">
                  <BadgeCheck aria-hidden="true" className="size-3.5 text-brand" />
                  Domain verified
                </Badge>
              )}
            </div>
            <p className="mt-1.5 text-lg text-muted-foreground [overflow-wrap:anywhere]">
              {item.tagline}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              by{" "}
              {demo ? (
                <span className="text-foreground">{item.owner_name}</span>
              ) : (
                <Link
                  href={`/users/${item.owner_slug}`}
                  className="text-foreground hover:underline"
                >
                  {item.owner_name}
                </Link>
              )}
              <span aria-hidden="true" className="mx-2">
                ·
              </span>
              <Link href={categoryHref} className="hover:text-foreground">
                {item.category}
              </Link>
            </p>
          </div>
          {(item.website || item.owner_id) && (
            <div className="flex gap-2 sm:w-44 sm:flex-col">
              {item.website && (
                <Button asChild className="max-sm:flex-1">
                  <a href={item.website} target="_blank" rel={websiteRel(item.revenue_status)}>
                    Visit website
                    <ArrowUpRight />
                  </a>
                </Button>
              )}
              {item.owner_id && (
                <SendMessageButton
                  makerId={item.owner_id}
                  viewerId={viewerId}
                  className="max-sm:flex-1"
                />
              )}
            </div>
          )}
        </div>
        <dl className="grid divide-y border-t bg-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Metric
            label="Monthly recurring revenue"
            value={item.mrr_cents == null ? null : formatUsd(item.mrr_cents)}
            detail={item.mrr_growth_pct != null && <Growth pct={item.mrr_growth_pct} />}
          />
          <Metric
            label="Paying customers"
            value={item.customers?.toLocaleString("en-US") ?? null}
          />
          <Metric label="Launched" value={item.launched_on ? formatDate(item.launched_on) : null} />
        </dl>
        {/* Revenue besides MRR, one-time purchases included, shows only where it is shared. */}
        {revenueShared && (
          <dl className="grid divide-y border-t bg-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {REVENUE_WINDOWS.map(({ column, label }) => {
              const cents = item[column];
              return (
                <Metric
                  key={column}
                  label={label}
                  value={cents == null ? null : formatUsd(cents)}
                />
              );
            })}
          </dl>
        )}
      </header>
      {(verified || (demo && item.mrr_cents != null)) && (
        <p className="mt-3 flex items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
          {demo ? (
            "Demo figures, made up for this example and not verified."
          ) : (
            <>
              <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-brand" />
              Verified with {providerName(item.provider)} through a read-only key. Last verified{" "}
              {formatDate(item.verified_at)}.{!item.livemode && " Test mode data."}
            </>
          )}
        </p>
      )}

      {/* The details sit beside the chart and the description, so the chart keeps a readable
          width on wide screens. */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 content-start gap-10">
          {history && (
            <RevenueHistory
              history={history}
              description={demo ? "Made-up figures for the last 12 months." : undefined}
            />
          )}
          <section>
            <h2 className="text-lg font-semibold">About {name}</h2>
            <p className="mt-3 leading-7 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
              {item.description}
            </p>
          </section>
          <TechStack stack={item.tech_stack} />
        </div>
        <aside className="grid content-start gap-4">
          {views && <ViewCounts views={views} />}
          <div className="rounded-xl border bg-surface p-5 shadow-card">
            <h2 className="text-sm text-muted-foreground">Founder</h2>
            {demo ? (
              <div className="mt-3 flex items-center gap-3">{maker}</div>
            ) : (
              <Link
                href={`/users/${item.owner_slug}`}
                className="group mt-3 flex items-center gap-3"
              >
                {maker}
              </Link>
            )}
          </div>
          <dl className="grid gap-3 rounded-xl border bg-surface p-5 text-sm shadow-card">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Category</dt>
              <dd className="text-right">{item.category}</dd>
            </div>
            {site && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Website</dt>
                <dd className="truncate text-right">{site}</dd>
              </div>
            )}
            {/* Verifying the domain is optional; the founder adds a DNS record from the editor. */}
            {site && !demo && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Domain</dt>
                {item.verified_domain ? (
                  <dd className="flex items-center gap-1.5 text-right">
                    <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-brand" />
                    Verified
                  </dd>
                ) : (
                  <dd className="text-right text-muted-foreground">Not verified</dd>
                )}
              </div>
            )}
            {item.created_at && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Listed</dt>
                <dd className="text-right">{formatDate(item.created_at)}</dd>
              </div>
            )}
          </dl>
          {!demo && item.id && viewerId !== item.owner_id && (
            <ReportLink target="saas" id={item.id} className="mt-1">
              Report this product
            </ReportLink>
          )}
        </aside>
      </div>
    </Shell>
  );
}
