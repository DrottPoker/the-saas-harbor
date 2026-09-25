import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { parseHistory } from "@/lib/charts";
import { findSaas, publicProfile, type RevenueStatus } from "@/lib/data";
import { currentUser } from "@/lib/supabase/server";
import { formatDate, formatUsd } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";
import { PersonAvatar, ProductLogo } from "@/components/avatars";
import { Growth } from "@/components/charts/growth";
import { Metric } from "@/components/metric";
import { RevenueHistory } from "@/components/charts/revenue-history";
import { SendMessageButton } from "@/components/messages/send-message-button";
import { ReportLink } from "@/components/report-link";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findSaas((await params).slug);
  if (!found || "redirect" in found || !found.item.name || !found.item.tagline) return {};
  return pageMetadata({
    title: found.item.name,
    description: found.item.tagline,
    path: `/saas/${found.item.slug}`,
  });
}

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

export default async function SaasProfile({ params }: Props) {
  const [found, viewer] = await Promise.all([findSaas((await params).slug), currentUser()]);
  if (!found) notFound();
  // An id, an earlier slug or another letter case moves to the current address.
  if ("redirect" in found) permanentRedirect(found.redirect);
  const item = found.item;
  const id = item.id!;
  const maker = item.owner_id ? await publicProfile(item.owner_id) : null;
  const name = item.name ?? "SaaS";
  const site = hostname(item.website);
  const status = (item.revenue_status ?? "unverified") as RevenueStatus;
  const history = parseHistory(item.mrr_history);

  return (
    <Shell size="medium">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground">
        <Link href="/discover" className="hover:text-foreground">
          Browse
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-foreground">{name}</span>
      </nav>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <ProductLogo path={item.logo_path} name={name} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{name}</h1>
          <p className="mt-1.5 text-lg text-muted-foreground">{item.tagline}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            <Link
              href={`/discover?category=${encodeURIComponent(item.category ?? "")}`}
              className="hover:text-foreground"
            >
              {item.category}
            </Link>
            <span aria-hidden="true" className="mx-2">
              ·
            </span>
            by{" "}
            <Link href={`/makers/${item.owner_slug}`} className="text-foreground hover:underline">
              {item.owner_name}
            </Link>
          </p>
        </div>
        {item.website && (
          <Button asChild variant="outline" className="self-start">
            <a href={item.website} target="_blank" rel="noopener noreferrer nofollow">
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
        {status === "unverified" ? (
          "Revenue has not been verified. The maker has not connected Stripe."
        ) : (
          <>
            <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-brand" />
            Verified with Stripe through a read-only key. Last verified{" "}
            {formatDate(item.verified_at)}.{!item.livemode && " Test mode data."}
          </>
        )}
      </p>

      {history && <RevenueHistory history={history} />}

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
        <section>
          <h2 className="text-lg font-semibold">About {name}</h2>
          <p className="mt-3 leading-7 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
            {item.description}
          </p>
        </section>
        <aside className="grid content-start gap-4">
          <div className="rounded-xl border bg-surface p-5">
            <h2 className="text-sm text-muted-foreground">Maker</h2>
            <Link
              href={`/makers/${item.owner_slug}`}
              className="group mt-3 flex items-center gap-3"
            >
              <PersonAvatar path={item.owner_avatar_path} name={item.owner_name ?? "Maker"} />
              <span className="min-w-0">
                <span className="block font-medium group-hover:underline">{item.owner_name}</span>
                {maker?.headline && (
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    {maker.headline}
                  </span>
                )}
              </span>
            </Link>
            {item.owner_id && (
              <SendMessageButton
                makerId={item.owner_id}
                viewerId={viewer?.id ?? null}
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
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Listed</dt>
              <dd className="text-right">{formatDate(item.created_at)}</dd>
            </div>
          </dl>
          {viewer?.id !== item.owner_id && (
            <ReportLink target="saas" id={id} className="mt-1">
              Report this product
            </ReportLink>
          )}
        </aside>
      </div>
    </Shell>
  );
}
