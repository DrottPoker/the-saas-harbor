import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ConversionNote } from "@/components/conversion-note";
import { categoryChip, categoryChipRow } from "@/components/explore";
import { JsonLd } from "@/components/json-ld";
import { Leaderboard, ListingGrid } from "@/components/listings";
import { EmptyState, Notice, PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { categoryKey } from "@/i18n/names";
import { categoryCounts, listings, PAGE_SIZE } from "@/lib/data";
import { categories, categoryFromSlug, categorySlug } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";
import { categoryJsonLd } from "@/lib/structured-data";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = categoryFromSlug((await params).slug);
  if (!category) return {};
  const [counts, t, names] = await Promise.all([
    categoryCounts(),
    getTranslations("lists.category"),
    getTranslations("categories"),
  ]);
  const name = names(categoryKey(category));
  return {
    ...(await pageMetadata({
      title: t("metaTitle", { category: name }),
      description: t("intro", { category: name }),
      path: `/categories/${categorySlug(category)}`,
    })),
    // An empty category page has nothing for search engines yet.
    ...(!counts.get(category)?.products && { robots: { index: false } }),
  };
}

// A category's ranked products first, then the rest A to Z. Each part shows one page, with a link
// to the full list. Demo products are left out: this page is for search engines too.
export default async function Category({ params }: Props) {
  const category = categoryFromSlug((await params).slug);
  if (!category) notFound();
  const [ranked, rest, lists, t, names] = await Promise.all([
    listings({ sort: "rank", category }),
    listings({ sort: "name", category, unranked: true }),
    getTranslations("lists"),
    getTranslations("lists.category"),
    getTranslations("categories"),
  ]);
  const error = ranked.error ?? rest.error;
  const query = `?category=${encodeURIComponent(category)}`;
  const name = names(categoryKey(category));

  return (
    <Shell>
      <JsonLd data={categoryJsonLd(category, ranked.rows)} />
      <nav aria-label={lists("breadcrumb")} className="mb-6 text-sm text-muted-foreground">
        <Link href="/categories" className="hover:text-foreground">
          {lists("categories.title")}
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-foreground">{name}</span>
      </nav>
      <PageHeader
        title={t("title", { category: name })}
        description={t("intro", { category: name })}
      />
      <nav aria-label={lists("categories.title")} className={categoryChipRow}>
        {categories.map((item) => (
          <Link
            key={item}
            href={`/categories/${categorySlug(item)}`}
            aria-current={item === category ? "page" : undefined}
            className={categoryChip}
          >
            {names(categoryKey(item))}
          </Link>
        ))}
      </nav>

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !ranked.count && !rest.count ? (
        <EmptyState
          title={t("emptyTitle", { category: name })}
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/saas/new">{lists("listYourSaas")}</Link>
            </Button>
          }
        >
          {t("emptyBody")}
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
                    {t("allRanked", { count: ranked.count, category: name })}
                  </Link>
                </p>
              )}
            </section>
          )}
          {!!rest.count && (
            <section aria-labelledby="unranked">
              <h2 id="unranked" className="text-lg font-semibold">
                {t(ranked.count ? "more" : "products", { category: name })}
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">{lists("unrankedNote")}</p>
              <ListingGrid items={rest.rows} meta="maker" />
              {rest.count > PAGE_SIZE && (
                <p className="mt-4 text-sm">
                  <Link
                    href={`/browse${query}`}
                    className="font-medium underline underline-offset-2"
                  >
                    {t("browseAll", { category: name })}
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
