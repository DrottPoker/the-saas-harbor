import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowUpRight } from "lucide-react";
import { listings, publicProfile, safePage } from "@/lib/data";
import { PersonAvatar } from "@/components/avatars";
import { ListingGrid, ResultsFooter } from "@/components/listings";
import { EmptyState, Notice, Shell } from "@/components/shell";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  const profile = await publicProfile(id);
  return profile ? { title: profile.name, description: profile.bio || undefined } : {};
}

export default async function Maker({ params, searchParams }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const profile = await publicProfile(id);
  if (!profile) notFound();
  const page = safePage((await searchParams).page);
  const result = await listings({ owner: id, page });
  const links = [
    ["Website", profile.website],
    ["Social profile", profile.social_url],
  ].filter(([, href]) => href);

  return (
    <Shell>
      <header className="flex flex-col gap-5 border-b pb-10 sm:flex-row sm:items-center sm:gap-6">
        <PersonAvatar path={profile.avatar_path} name={profile.name} size="xl" decorative={false} />
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {profile.name}
          </h1>
          {profile.bio && (
            <p className="mt-2 max-w-2xl whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
              {profile.bio}
            </p>
          )}
          {links.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {links.map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 font-medium hover:underline"
                >
                  {label}
                  <ArrowUpRight className="size-3.5 text-muted-foreground" />
                </a>
              ))}
            </p>
          )}
        </div>
      </header>

      <section className="pt-10">
        <h2 className="mb-4 text-lg font-semibold">Products</h2>
        {result.error ? (
          <Notice tone="error">{result.error}</Notice>
        ) : !result.rows.length ? (
          <EmptyState title="No products listed">
            {profile.name} has not listed a product yet.
          </EmptyState>
        ) : (
          <>
            <ListingGrid items={result.rows} meta="joined" />
            <ResultsFooter page={page} count={result.count} href={(next) => `?page=${next}`} />
          </>
        )}
      </section>
    </Shell>
  );
}
