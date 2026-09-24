import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { MapPin, Pencil } from "lucide-react";
import { PersonAvatar } from "@/components/avatars";
import { ListingGrid, ResultsFooter } from "@/components/listings";
import { SendMessageButton } from "@/components/messages/send-message-button";
import {
  EntryList,
  OpenTo,
  ProfileCard,
  ProfileLinks,
  Skills,
} from "@/components/profile/profile-sections";
import { EmptyState, Notice, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { listings, PAGE_SIZE, publicProfile, publicProfileEntries, safePage } from "@/lib/data";
import { imageUrl } from "@/lib/images";
import { currentUser } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  const profile = await publicProfile(id);
  return profile
    ? { title: profile.name, description: profile.headline || profile.bio || undefined }
    : {};
}

export default async function Maker({ params, searchParams }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const profile = await publicProfile(id);
  if (!profile) notFound();
  const page = safePage((await searchParams).page);
  const [entries, result, viewer] = await Promise.all([
    publicProfileEntries(id),
    listings({ owner: id, page }),
    currentUser(),
  ]);
  const own = viewer?.id === id;
  const experience = entries.filter((entry) => entry.kind === "experience");
  const education = entries.filter((entry) => entry.kind === "education");
  const cover = imageUrl(profile.cover_path);
  const missing = [
    !profile.headline && "a headline",
    !profile.bio && "an About section",
    !experience.length && "your experience",
    !profile.skills.length && "skills",
  ].filter(Boolean);

  return (
    <Shell size="narrow">
      <section
        aria-labelledby="maker-name"
        className="overflow-hidden rounded-xl border bg-surface"
      >
        <div className="relative aspect-[3/1] bg-linear-to-br from-brand-soft via-muted to-subtle sm:aspect-[4/1]">
          {cover && (
            <Image src={cover} alt="" fill sizes="768px" className="object-cover" unoptimized />
          )}
        </div>
        <div className="px-5 pb-6 sm:px-8">
          <div className="flex items-end justify-between gap-4">
            <PersonAvatar
              path={profile.avatar_path}
              name={profile.name}
              size="2xl"
              decorative={false}
              className="relative -mt-12 border-4 border-surface sm:-mt-16"
            />
            <div className="flex gap-2 pt-4">
              {own ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/profile">
                    <Pencil />
                    Edit profile
                  </Link>
                </Button>
              ) : (
                <SendMessageButton makerId={id} viewerId={viewer?.id ?? null} size="sm" />
              )}
            </div>
          </div>
          <h1
            id="maker-name"
            className="mt-4 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl"
          >
            {profile.name}
          </h1>
          {profile.headline && (
            <p className="mt-1 text-base [overflow-wrap:anywhere] sm:text-lg">{profile.headline}</p>
          )}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {profile.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="size-4" />
                {profile.location}
              </span>
            )}
            {result.count > 0 && (
              <span>
                {result.count} {result.count === 1 ? "product" : "products"}
              </span>
            )}
          </p>
          <ProfileLinks profile={profile} className="mt-4" />
        </div>
      </section>

      {own && missing.length > 0 && (
        <Notice className="mt-6">
          Add {missing.join(", ").replace(/, ([^,]*)$/, " and $1")} so other makers get to know you.{" "}
          <Link href="/dashboard/profile" className="font-medium underline">
            Edit profile
          </Link>
        </Notice>
      )}

      <div className="mt-6 grid gap-6">
        {profile.open_to.length > 0 && <OpenTo name={profile.name} values={profile.open_to} />}
        {profile.bio && (
          <ProfileCard id="about" title="About">
            <p className="leading-7 whitespace-pre-wrap text-foreground/85 [overflow-wrap:anywhere]">
              {profile.bio}
            </p>
          </ProfileCard>
        )}
        <ProfileCard id="products" title="Products">
          {result.error ? (
            <Notice tone="error">{result.error}</Notice>
          ) : !result.rows.length ? (
            <EmptyState title="No products listed">
              {profile.name} has not listed a product yet.
            </EmptyState>
          ) : (
            <>
              <ListingGrid items={result.rows} meta="joined" columns={2} />
              {/* The header already shows the count; pages only matter for long lists. */}
              {result.count > PAGE_SIZE && (
                <ResultsFooter page={page} count={result.count} href={(next) => `?page=${next}`} />
              )}
            </>
          )}
        </ProfileCard>
        {experience.length > 0 && (
          <ProfileCard id="experience" title="Experience">
            <EntryList entries={experience} />
          </ProfileCard>
        )}
        {education.length > 0 && (
          <ProfileCard id="education" title="Education">
            <EntryList entries={education} />
          </ProfileCard>
        )}
        {profile.skills.length > 0 && (
          <ProfileCard id="skills" title="Skills">
            <Skills skills={profile.skills} />
          </ProfileCard>
        )}
      </div>
    </Shell>
  );
}
