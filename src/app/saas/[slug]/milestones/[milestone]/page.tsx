import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { formatDate } from "@/lib/domain";
import {
  milestoneHeadline,
  milestoneObject,
  milestonePath,
  milestoneSentence,
  shareText,
} from "@/lib/milestones";
import { shareLinks } from "@/lib/share";
import { providerName } from "@/lib/revenue/catalog";
import { pageMetadata, SITE_NAME, siteUrl } from "@/lib/seo";
import { ProductLogo } from "@/components/avatars";
import { CopyField } from "@/components/copy-field";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { loadMilestone, type Params } from "./load";

type Props = { params: Params };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await loadMilestone(params);
  if (!found || "redirect" in found) return {};
  const { item, milestone } = found;
  const name = item.name ?? "Product";
  return {
    ...pageMetadata({
      title: `${name} reached ${milestoneObject(milestone)}`,
      description: `${milestoneSentence(milestone, name)} Verified revenue on ${SITE_NAME}.`,
      path: milestonePath(item.slug ?? "", milestone),
    }),
    // The page exists to be shared; the product page is the one for search results.
    robots: { index: false, follow: true },
  };
}

export default async function MilestonePage({ params }: Props) {
  const found = await loadMilestone(params);
  if (!found) notFound();
  if ("redirect" in found) {
    // A new address for the product is lasting; a milestone that is not shown may be again.
    if (found.redirect.includes("/milestones/")) permanentRedirect(found.redirect);
    redirect(found.redirect);
  }
  const { item, milestone, key, reachedAt } = found;
  const name = item.name ?? "Product";
  const path = milestonePath(item.slug ?? "", milestone);
  const url = `${siteUrl()}${path}`;
  const share = shareLinks(url, shareText(milestone, name));
  return (
    <Shell size="narrow" className="pt-6 sm:pt-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/browse" className="hover:text-foreground">
          Browse
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link
          href={`/saas/${item.slug}`}
          className="hover:text-foreground [overflow-wrap:anywhere]"
        >
          {name}
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-foreground">Milestone</span>
      </nav>

      <article className="overflow-hidden rounded-xl border bg-surface shadow-card">
        <div className="p-6 sm:p-8">
          <p className="text-sm text-muted-foreground">
            Milestone reached on <time dateTime={reachedAt}>{formatDate(reachedAt)}</time>
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
            {milestoneHeadline(milestone)}
          </h1>
          <p className="mt-3 text-lg text-muted-foreground [overflow-wrap:anywhere]">
            {milestoneSentence(milestone, name)} The revenue is verified through{" "}
            {providerName(item.provider)}.
          </p>
        </div>
        <div className="flex flex-col gap-4 border-t bg-subtle p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ProductLogo path={item.logo_path} name={name} />
            <div className="min-w-0">
              <p className="font-medium [overflow-wrap:anywhere]">{name}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {item.tagline}
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href={`/saas/${item.slug}`}>View product</Link>
          </Button>
        </div>
      </article>

      <section aria-labelledby="share" className="mt-10 grid gap-4">
        <div>
          <h2 id="share" className="text-lg font-semibold">
            Share this milestone
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A post with this link shows a card with the milestone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={share.x} target="_blank" rel="noopener noreferrer">
              Share on X
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={share.linkedin} target="_blank" rel="noopener noreferrer">
              Share on LinkedIn
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${path}/opengraph-image`} download={`${item.slug}-${key}.png`}>
              Download image
            </a>
          </Button>
        </div>
        <CopyField id="milestone_link" label="Link" value={url} copyLabel="Copy link" />
      </section>
    </Shell>
  );
}
