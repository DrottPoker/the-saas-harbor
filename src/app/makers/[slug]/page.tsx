import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BadgeCheck, Pencil } from "lucide-react";
import { PersonAvatar } from "@/components/avatars";
import { ListingGrid, ResultsFooter } from "@/components/listings";
import { SendMessageButton } from "@/components/messages/send-message-button";
import { Metric } from "@/components/metric";
import { ProfileDetails, RoleList, Skills } from "@/components/profile/profile-sections";
import { ReportLink } from "@/components/report-link";
import { EmptyState, Notice, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import {
  findProfile,
  listings,
  makerTotals,
  PAGE_SIZE,
  publicProfileExperience,
  safePage,
} from "@/lib/data";
import { formatUsd } from "@/lib/domain";
import { excerpt } from "@/lib/moderation";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import { currentUser } from "@/lib/supabase/server";
import { firstValues } from "@/lib/params";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const found = await findProfile((await params).slug);
  if (!found || "redirect" in found) return {};
  const profile = found.item;
  return pageMetadata({
    title: profile.name,
    description:
      profile.headline ||
      (profile.bio && excerpt(profile.bio, 160)) ||
      `${profile.name} on ${SITE_NAME}`,
    path: `/makers/${profile.slug}`,
    type: "profile",
  });
}

const across = (count: number) => `Across ${count} ${count === 1 ? "product" : "products"}`;

// Laid out like the product page: a header, key figures, then the story with details at the side.
export default async function Maker({ params, searchParams }: Props) {
  const found = await findProfile((await params).slug);
  if (!found) notFound();
  // An id or another letter case moves to the current address.
  if ("redirect" in found) permanentRedirect(found.redirect);
  const profile = found.item;
  const id = profile.id;
  const page = safePage(firstValues(await searchParams).page);
  const [experience, totals, result, viewer] = await Promise.all([
    publicProfileExperience(id),
    makerTotals(id),
    listings({ owner: id, page }),
    currentUser(),
  ]);
  const own = viewer?.id === id;
  const missing = [
    !profile.headline && "a headline",
    !profile.bio && "an About section",
    !experience.length && "your experience",
    !profile.skills.length && "skills",
  ].filter(Boolean);

  return (
    <Shell size="medium">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <PersonAvatar path={profile.avatar_path} name={profile.name} size="xl" decorative={false} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {profile.name}
          </h1>
          {profile.headline && (
            <p className="mt-1.5 text-lg text-muted-foreground [overflow-wrap:anywhere]">
              {profile.headline}
            </p>
          )}
          {profile.location && (
            <p className="mt-3 text-sm text-muted-foreground">{profile.location}</p>
          )}
        </div>
        {own ? (
          <Button asChild variant="outline" className="self-start">
            <Link href="/dashboard/profile">
              <Pencil />
              Edit profile
            </Link>
          </Button>
        ) : (
          <SendMessageButton makerId={id} viewerId={viewer?.id ?? null} className="self-start" />
        )}
      </header>

      <dl className="mt-10 grid divide-y rounded-xl border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Metric label="Products" value={String(totals.products)} />
        <Metric
          label="Verified MRR"
          value={totals.mrr.total === null ? null : formatUsd(totals.mrr.total)}
          detail={<span className="text-xs text-muted-foreground">{across(totals.mrr.count)}</span>}
        />
        <Metric
          label="Paying customers"
          value={totals.customers.total?.toLocaleString("en-US") ?? null}
          detail={
            <span className="text-xs text-muted-foreground">{across(totals.customers.count)}</span>
          }
        />
      </dl>
      <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-brand" />
        Figures are verified with Stripe and include only the products that share them.
      </p>

      {own && missing.length > 0 && (
        <Notice className="mt-6">
          Add {missing.join(", ").replace(/, ([^,]*)$/, " and $1")} so other makers get to know you.{" "}
          <Link href="/dashboard/profile" className="font-medium underline">
            Edit profile
          </Link>
        </Notice>
      )}

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
        <div className="grid min-w-0 content-start gap-12">
          {profile.bio && (
            <section>
              <h2 className="text-lg font-semibold">About {profile.name}</h2>
              <p className="mt-3 leading-7 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
                {profile.bio}
              </p>
            </section>
          )}
          <section aria-labelledby="products">
            <h2 id="products" className="text-lg font-semibold">
              Products
            </h2>
            <div className="mt-4">
              {result.error ? (
                <Notice tone="error">{result.error}</Notice>
              ) : !result.rows.length ? (
                <EmptyState title="No products listed">
                  {profile.name} has not listed a product yet.
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
          {experience.length > 0 && (
            <section aria-labelledby="experience">
              <h2 id="experience" className="text-lg font-semibold">
                Experience
              </h2>
              <div className="mt-4">
                <RoleList roles={experience} />
              </div>
            </section>
          )}
        </div>
        <aside className="grid content-start gap-4">
          <ProfileDetails profile={profile} />
          {profile.skills.length > 0 && <Skills skills={profile.skills} />}
          {!own && (
            <ReportLink target="profile" id={id} className="mt-1">
              Report this profile
            </ReportLink>
          )}
        </aside>
      </div>
    </Shell>
  );
}
