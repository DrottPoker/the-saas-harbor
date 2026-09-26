import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { Leaderboard, ListingGrid } from "@/components/listings";
import { EmptyState, Notice, PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { listings, PAGE_SIZE, techCounts } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { techJsonLd } from "@/lib/structured-data";
import { techFromSlug, type Tech } from "@/lib/tech";

type Props = { params: Promise<{ slug: string }> };

const intro = (tech: Tech) =>
  `Independent SaaS products built with ${tech.name}, as their founders list them, ranked by monthly recurring revenue verified through each product's payment provider.`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tech = techFromSlug((await params).slug);
  if (!tech) return {};
  const count = (await techCounts()).get(tech.slug);
  return {
    ...pageMetadata({
      title: `SaaS built with ${tech.name}`,
      description: intro(tech),
      path: `/tech/${tech.slug}`,
    }),
    // A technology without listed products has nothing for search engines yet.
    ...(!count?.products && { robots: { index: false } }),
  };
}

// The products built with a technology: ranked ones first, then the rest A to Z, one page each.
// Demo products name no stack, so they never appear here.
export default async function TechPage({ params }: Props) {
  const tech = techFromSlug((await params).slug);
  if (!tech) notFound();
  const [ranked, rest] = await Promise.all([
    listings({ sort: "rank", tech: tech.slug }),
    listings({ sort: "name", tech: tech.slug, unranked: true }),
  ]);
  const error = ranked.error ?? rest.error;
  const query = `?tech=${tech.slug}`;

  return (
    <Shell>
      <JsonLd data={techJsonLd(tech, ranked.rows)} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link href="/tech" className="hover:text-foreground">
          Tech stacks
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-foreground">{tech.name}</span>
      </nav>
      <PageHeader title={`SaaS built with ${tech.name}`} description={intro(tech)} />

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !ranked.count && !rest.count ? (
        <EmptyState
          title={`No products built with ${tech.name} yet`}
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/saas/new">List your SaaS</Link>
            </Button>
          }
        >
          Products appear here when their founders add {tech.name} to their tech stack.
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
                    All {ranked.count} ranked products built with {tech.name}
                  </Link>
                </p>
              )}
            </section>
          )}
          {!!rest.count && (
            <section aria-labelledby="unranked">
              <h2 id="unranked" className="text-lg font-semibold">
                {ranked.count
                  ? `More products built with ${tech.name}`
                  : `Products built with ${tech.name}`}
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
                    Browse all products built with {tech.name}
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
