import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryChip, categoryChipRow } from "@/components/explore";
import { JsonLd } from "@/components/json-ld";
import { Leaderboard, ListingGrid } from "@/components/listings";
import { EmptyState, Notice, PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { categoryCounts, listings, PAGE_SIZE } from "@/lib/data";
import { categories, categoryFromSlug, categorySlug } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";
import { categoryJsonLd } from "@/lib/structured-data";

type Props = { params: Promise<{ slug: string }> };

const intro = (category: string) =>
  `Independent ${category} products, ranked by monthly recurring revenue verified through each product's payment provider.`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = categoryFromSlug((await params).slug);
  if (!category) return {};
  const count = (await categoryCounts()).get(category);
  return {
    ...pageMetadata({
      title: `${category} SaaS ranked by verified MRR`,
      description: intro(category),
      path: `/categories/${categorySlug(category)}`,
    }),
    // An empty category page has nothing for search engines yet.
    ...(!count?.products && { robots: { index: false } }),
  };
}

// A category's ranked products first, then the rest A to Z. Each part shows one page, with a link
// to the full list. Demo products are left out: this page is for search engines too.
export default async function Category({ params }: Props) {
  const category = categoryFromSlug((await params).slug);
  if (!category) notFound();
  const [ranked, rest] = await Promise.all([
    listings({ sort: "rank", category }),
    listings({ sort: "name", category, unranked: true }),
  ]);
  const error = ranked.error ?? rest.error;
  const query = `?category=${encodeURIComponent(category)}`;

  return (
    <Shell>
      <JsonLd data={categoryJsonLd(category, ranked.rows)} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link href="/categories" className="hover:text-foreground">
          Categories
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-foreground">{category}</span>
      </nav>
      <PageHeader title={`${category} SaaS`} description={intro(category)} />
      <nav aria-label="Categories" className={categoryChipRow}>
        {categories.map((item) => (
          <Link
            key={item}
            href={`/categories/${categorySlug(item)}`}
            aria-current={item === category ? "page" : undefined}
            className={categoryChip}
          >
            {item}
          </Link>
        ))}
      </nav>

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !ranked.count && !rest.count ? (
        <EmptyState
          title={`No ${category} products yet`}
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/saas/new">Submit your SaaS</Link>
            </Button>
          }
        >
          Products appear here when their makers list them in this category.
        </EmptyState>
      ) : (
        <div className="grid gap-12">
          {!!ranked.count && (
            <section aria-labelledby="ranked">
              <h2 id="ranked" className="mb-4 text-lg font-semibold">
                Ranked by verified MRR
              </h2>
              <Leaderboard items={ranked.rows} labelledBy="ranked" />
              {ranked.count > PAGE_SIZE && (
                <p className="mt-4 text-sm">
                  <Link href={`/${query}`} className="font-medium underline underline-offset-2">
                    All {ranked.count} ranked {category} products
                  </Link>
                </p>
              )}
            </section>
          )}
          {!!rest.count && (
            <section aria-labelledby="unranked">
              <h2 id="unranked" className="text-lg font-semibold">
                {ranked.count ? `More ${category} products` : `${category} products`}
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Listed without shared, verified revenue, A to Z.
              </p>
              <ListingGrid items={rest.rows} meta="maker" />
              {rest.count > PAGE_SIZE && (
                <p className="mt-4 text-sm">
                  <Link
                    href={`/discover${query}`}
                    className="font-medium underline underline-offset-2"
                  >
                    Browse all {category} products
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
