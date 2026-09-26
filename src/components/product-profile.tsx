import Link from "next/link";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { parseHistory } from "@/lib/charts";
import type { Listing, PageViewCounts, RevenueStatus } from "@/lib/data";
import { categorySlug, formatDate, formatUsd } from "@/lib/domain";
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

// Why a revenue figure is missing, for visitors.
const missingRevenue: Record<RevenueStatus, string> = {
  verified: "Not shared",
  private: "Not shared",
  stale: "Verification out of date",
  unverified: "Not verified",
};

/** How often the page was viewed, shown to the founder only. */
function ViewCounts({ views }: { views: PageViewCounts }) {
  const periods = [
    ["Last 7 days", views.last_7_days],
    ["Last 30 days", views.last_30_days],
    ["All time", views.all_time],
  ] as const;
  return (
    <section aria-labelledby="page-views" className="rounded-xl border bg-surface p-5">
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
  const status = (item.revenue_status ?? "unverified") as RevenueStatus;
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
    <Shell size="medium">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground">
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

      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <ProductLogo
          path={item.logo_path}
          name={name}
          size="xl"
          mark={demo && <DemoLogo logo={demo.logo} />}
        />
        <div className="min-w-0 flex-1">
          {demo ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {title}
              <Badge>Demo</Badge>
            </div>
          ) : (
            title
          )}
          <p className="mt-1.5 text-lg text-muted-foreground [overflow-wrap:anywhere]">
            {item.tagline}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            <Link href={categoryHref} className="hover:text-foreground">
              {item.category}
            </Link>
            <span aria-hidden="true" className="mx-2">
              ·
            </span>
            by{" "}
            {demo ? (
              <span className="text-foreground">{item.owner_name}</span>
            ) : (
              <Link href={`/users/${item.owner_slug}`} className="text-foreground hover:underline">
                {item.owner_name}
              </Link>
            )}
          </p>
        </div>
        {item.website && (
          <Button asChild variant="outline" className="self-start">
            <a href={item.website} target="_blank" rel={websiteRel(item.revenue_status)}>
              Visit website
              <ArrowUpRight />
            </a>
          </Button>
        )}
      </header>

      <dl className="mt-10 grid divide-y rounded-xl border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Metric
          label="Monthly recurring revenue"
          value={item.mrr_cents == null ? null : formatUsd(item.mrr_cents)}
          empty={missingRevenue[status]}
          detail={item.mrr_growth_pct != null && <Growth pct={item.mrr_growth_pct} />}
        />
        <Metric
          label="Paying customers"
          value={item.customers?.toLocaleString("en-US") ?? null}
          empty={missingRevenue[status]}
        />
        <Metric label="Launched" value={item.launched_on ? formatDate(item.launched_on) : null} />
      </dl>
      <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {demo ? (
          status === "unverified" ? (
            "A demo of a product whose founder has not connected a payment provider, so it shows no revenue."
          ) : (
            "Demo figures, made up for this example and not verified."
          )
        ) : status === "unverified" ? (
          "Revenue has not been verified. The founder has not connected a payment provider."
        ) : (
          <>
            <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-brand" />
            Verified with {providerName(item.provider)} through a read-only key. Last verified{" "}
            {formatDate(item.verified_at)}.{!item.livemode && " Test mode data."}
          </>
        )}
      </p>
      {!demo && item.verified_domain && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-brand" />
          <span className="[overflow-wrap:anywhere]">
            The founder proved control of {item.verified_domain} with a DNS record. Last checked{" "}
            {formatDate(item.domain_verified_at)}.
          </span>
        </p>
      )}

      {history && (
        <RevenueHistory
          history={history}
          description={demo ? "Made-up figures for the last 12 months." : undefined}
        />
      )}

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
        <div className="grid content-start gap-10">
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
          <div className="rounded-xl border bg-surface p-5">
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
            {item.owner_id && (
              <SendMessageButton
                makerId={item.owner_id}
                viewerId={viewerId}
                size="sm"
                className="mt-4 w-full"
              />
            )}
          </div>
          <dl className="grid gap-3 rounded-xl border bg-surface p-5 text-sm">
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
