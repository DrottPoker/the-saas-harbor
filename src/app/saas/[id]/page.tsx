import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowUpRight } from "lucide-react";
import { publicSaas } from "@/lib/data";
import { formatDate, formatUsd } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { PersonAvatar, ProductLogo } from "@/components/avatars";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  const item = await publicSaas(id);
  return item ? { title: item.name, description: item.tagline } : {};
}

function hostname(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 tabular-nums",
          value ? "text-2xl font-semibold tracking-tight" : "text-base text-faint-foreground",
        )}
      >
        {value ?? "Not shared"}
      </dd>
    </div>
  );
}

export default async function SaasProfile({ params }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const item = await publicSaas(id);
  if (!item) notFound();
  const name = item.name ?? "SaaS";
  const site = hostname(item.website);
  const shared = item.mrr_cents != null || item.customers != null || item.launched_on != null;

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
            <Link href={`/makers/${item.owner_id}`} className="text-foreground hover:underline">
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

      <dl className="mt-10 grid divide-y rounded-xl border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Metric
          label="Monthly recurring revenue"
          value={item.mrr_cents == null ? null : formatUsd(item.mrr_cents)}
        />
        <Metric label="Paying customers" value={item.customers?.toLocaleString("en-US") ?? null} />
        <Metric label="Launched" value={item.launched_on ? formatDate(item.launched_on) : null} />
      </dl>
      {shared && (
        <p className="mt-3 text-[13px] text-faint-foreground">
          Self-reported by the maker and not independently verified. Updated{" "}
          {formatDate(item.reported_at)}.
        </p>
      )}

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
        <section>
          <h2 className="text-lg font-semibold">About {name}</h2>
          <p className="mt-3 leading-7 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
            {item.description}
          </p>
        </section>
        <aside className="grid content-start gap-4">
          <div className="rounded-xl border p-5">
            <h2 className="text-sm text-muted-foreground">Maker</h2>
            <Link
              href={`/makers/${item.owner_id}`}
              className="mt-3 flex items-center gap-3 hover:underline"
            >
              <PersonAvatar path={item.owner_avatar_path} name={item.owner_name ?? "Maker"} />
              <span className="font-medium">{item.owner_name}</span>
            </Link>
          </div>
          <dl className="grid gap-3 rounded-xl border p-5 text-sm">
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
        </aside>
      </div>
    </Shell>
  );
}
