import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Pencil } from "lucide-react";
import { PersonAvatar } from "@/components/avatars";
import { ConversionNote } from "@/components/conversion-note";
import { ListingGrid, ResultsFooter } from "@/components/listings";
import { SendMessageButton } from "@/components/messages/send-message-button";
import { Metric } from "@/components/metric";
import { ProfileDetails } from "@/components/profile/profile-sections";
import { ReportLink } from "@/components/report-link";
import { EmptyState, Notice, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { findProfile, listings, makerTotals, PAGE_SIZE } from "@/lib/data";
import { getMoney } from "@/lib/display-currency";
import { formatCount, formatMoney } from "@/lib/display-money";
import { pageMetadata, profileDescription } from "@/lib/seo";
import { makerJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";
import { currentUser } from "@/lib/supabase/server";
import { firstValues, safePage } from "@/lib/params";
import { localePermanentRedirect } from "@/i18n/navigation";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const found = await findProfile((await params).slug);
  if (!found || "redirect" in found) return {};
  const profile = found.item;
  const totals = await makerTotals(profile.id);
  return {
    ...(await pageMetadata({
      title: profile.name,
      description: await profileDescription(profile, totals.names),
      path: `/users/${profile.slug}`,
      type: "profile",
      markdown: true,
    })),
    // A profile without products or a headline has nothing for search engines yet, and the sitemap
    // leaves out profiles without products.
    ...(!totals.products && !profile.headline && { robots: { index: false } }),
  };
}

// Laid out like the product page: a header, key figures, then the story with details at the side.
export default async function Maker({ params, searchParams }: Props) {
  const found = await findProfile((await params).slug);
  if (!found) notFound();
  // An id or another letter case moves to the current address.
  if ("redirect" in found) return localePermanentRedirect(found.redirect);
  const profile = found.item;
  const id = profile.id;
  const page = safePage(firstValues(await searchParams).page);
  const [totals, result, viewer, t, common, money] = await Promise.all([
    makerTotals(id),
    listings({ owner: id, page }),
    currentUser(),
    getTranslations("profile"),
    getTranslations("common"),
    getMoney(),
  ]);
  const own = viewer?.id === id;
  const across = (count: number) => (
    <span className="text-xs text-muted-foreground">{t("across", { count })}</span>
  );

  return (
    <Shell size="medium">
      <JsonLd data={makerJsonLd(profile)} />
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <PersonAvatar path={profile.avatar_path} name={profile.name} size="xl" decorative={false} />
        <div className="min-w-0 flex-1">
          <h1 dir="auto" className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {profile.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <bdi dir="ltr">@{profile.slug}</bdi>
          </p>
          {profile.headline && (
            <p dir="auto" className="mt-1.5 text-lg text-muted-foreground [overflow-wrap:anywhere]">
              {profile.headline}
            </p>
          )}
          {profile.location && (
            <p dir="auto" className="mt-3 text-sm text-muted-foreground">
              {profile.location}
            </p>
          )}
        </div>
        {own ? (
          <Button asChild variant="outline" className="self-start">
            <Link href="/dashboard/profile">
              <Pencil />
              {t("editProfile")}
            </Link>
          </Button>
        ) : (
          // A Server Component, so its messages need not go to the browser.
          <SendMessageButton makerId={id} viewerId={viewer?.id ?? null} className="self-start" />
        )}
      </header>

      <dl className="mt-10 grid divide-y rounded-xl border bg-surface shadow-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Metric label={t("products")} value={formatCount(totals.products, money.locale)} />
        <Metric
          label={common("verifiedMrr")}
          value={totals.mrr.total === null ? null : formatMoney(totals.mrr.total, money)}
          detail={across(totals.mrr.count)}
        />
        <Metric
          label={t("subscribers")}
          value={
            totals.customers.total === null
              ? null
              : formatCount(totals.customers.total, money.locale)
          }
          detail={across(totals.customers.count)}
        />
      </dl>
      <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-brand" />
        {t("figuresNote")}
      </p>
      <ConversionNote className="mt-1.5" />

      {own && !profile.headline && (
        <Notice className="mt-6">
          {t("addHeadline")}{" "}
          <Link href="/dashboard/profile" className="font-medium underline">
            {t("editProfile")}
          </Link>
        </Notice>
      )}

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
        <div className="grid min-w-0 content-start gap-12">
          <section aria-labelledby="products">
            <h2 id="products" className="text-lg font-semibold">
              {t("products")}
            </h2>
            <div className="mt-4">
              {result.error ? (
                <Notice tone="error">{result.error}</Notice>
              ) : !result.rows.length ? (
                <EmptyState title={t("noProductsTitle")}>
                  {t.rich("noProductsBody", { name: () => <bdi>{profile.name}</bdi> })}
                </EmptyState>
              ) : (
                <>
                  <ListingGrid items={result.rows} meta="joined" columns={2} />
                  {result.count > PAGE_SIZE && (
                    <ResultsFooter
                      page={page}
                      count={result.count}
                      href={(next) => `?page=${next}`}
                    />
                  )}
                </>
              )}
            </div>
          </section>
        </div>
        <aside className="grid content-start gap-4">
          <ProfileDetails profile={profile} />
          {!own && (
            <ReportLink target="profile" id={id} className="mt-1">
              {t("report")}
            </ReportLink>
          )}
        </aside>
      </div>
    </Shell>
  );
}
