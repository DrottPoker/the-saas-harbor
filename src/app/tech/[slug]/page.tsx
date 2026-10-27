import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ConversionNote } from "@/components/conversion-note";
import { JsonLd } from "@/components/json-ld";
import { Leaderboard, ListingGrid } from "@/components/listings";
import { EmptyState, Notice, PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { LOCALE_INFO } from "@/i18n/config";
import { listings, PAGE_SIZE, techCounts } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { techJsonLd } from "@/lib/structured-data";
import { techFromSlug } from "@/lib/tech";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tech = techFromSlug((await params).slug);
  if (!tech) return {};
  const [counts, t] = await Promise.all([techCounts(), getTranslations("lists.tech")]);
  return {
    ...(await pageMetadata({
      title: t("title", { tech: tech.name }),
      description: t("intro", { tech: tech.name }),
      path: `/tech/${tech.slug}`,
    })),
    // A technology without listed products has nothing for search engines yet.
    ...(!counts.get(tech.slug)?.products && { robots: { index: false } }),
  };
}

// The products built with a technology: ranked ones first, then the rest A to Z, one page each.
// Demo products name no stack, so they never appear here.
export default async function TechPage({ params }: Props) {
  const tech = techFromSlug((await params).slug);
  if (!tech) notFound();
  const [ranked, rest, lists, t, locale] = await Promise.all([
    listings({ sort: "rank", tech: tech.slug }),
    listings({ sort: "name", tech: tech.slug, unranked: true }),
    getTranslations("lists"),
    getTranslations("lists.tech"),
    getLocale(),
  ]);
  const error = ranked.error ?? rest.error;
  const query = `?tech=${tech.slug}`;
  // Names such as C# and .NET keep their order in right-to-left text only when isolated.
  const values = {
    tech: LOCALE_INFO[locale].dir === "rtl" ? `⁨${tech.name}⁩` : tech.name,
  };

  return (
    <Shell>
      <JsonLd data={techJsonLd(tech, ranked.rows)} />
      <nav aria-label={lists("breadcrumb")} className="mb-6 text-sm text-muted-foreground">
        <Link href="/tech" className="hover:text-foreground">
          {lists("techs.title")}
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <bdi className="text-foreground">{tech.name}</bdi>
      </nav>
      <PageHeader title={t("title", values)} description={t("intro", values)} />

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !ranked.count && !rest.count ? (
        <EmptyState
          title={t("emptyTitle", values)}
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/saas/new">{lists("listYourSaas")}</Link>
            </Button>
          }
        >
          {t("emptyBody", values)}
        </EmptyState>
      ) : (
        <div className="grid gap-12">
          {!!ranked.count && (
            <section aria-labelledby="ranked">
              <h2 id="ranked" className="mb-4 text-lg font-semibold">
                {lists("rankedTitle")}
              </h2>
              <Leaderboard items={ranked.rows} labelledBy="ranked" />
              <ConversionNote ranked className="mt-4" />
              {ranked.count > PAGE_SIZE && (
                <p className="mt-4 text-sm">
                  <Link href={`/${query}`} className="font-medium underline underline-offset-2">
                    {t("allRanked", { ...values, count: ranked.count })}
                  </Link>
                </p>
              )}
            </section>
          )}
          {!!rest.count && (
            <section aria-labelledby="unranked">
              <h2 id="unranked" className="text-lg font-semibold">
                {t(ranked.count ? "more" : "products", values)}
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">{lists("unrankedNote")}</p>
              <ListingGrid items={rest.rows} meta="maker" />
              {rest.count > PAGE_SIZE && (
                <p className="mt-4 text-sm">
                  <Link
                    href={`/browse${query}`}
                    className="font-medium underline underline-offset-2"
                  >
                    {t("browseAll", values)}
                  </Link>
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}
