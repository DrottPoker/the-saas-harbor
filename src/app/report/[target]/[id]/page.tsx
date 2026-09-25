import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PersonAvatar, ProductLogo } from "@/components/avatars";
import { BackLink } from "@/components/back-link";
import { LocalTime } from "@/components/local-time";
import { ReportForm } from "@/components/report-form";
import { Notice, PageHeader, Shell } from "@/components/shell";
import { publicProfile, publicSaas } from "@/lib/data";
import { MESSAGE_COLUMNS } from "@/lib/messages";
import { isReportTarget, reportPath, type ReportTarget } from "@/lib/moderation";
import { currentUser, serverClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ target: string; id: string }> };

export const metadata: Metadata = { title: "Report" };

// What is being reported, as the reporter sees it, and whether it is their own.
async function subject(target: ReportTarget, id: string, viewer: string) {
  if (target === "saas") {
    const item = await publicSaas(id);
    if (!item) return null;
    return {
      title: `Report ${item.name}`,
      back: { href: `/saas/${item.slug}`, label: item.name ?? "Product" },
      own: item.owner_id === viewer,
      ownCopy: "This is your product, so you cannot report it.",
      preview: (
        <div className="flex items-center gap-3">
          <ProductLogo path={item.logo_path} name={item.name ?? "Product"} />
          <div className="min-w-0">
            <p className="truncate font-medium">{item.name}</p>
            <p className="truncate text-sm text-muted-foreground">{item.tagline}</p>
          </div>
        </div>
      ),
    };
  }
  if (target === "profile") {
    const profile = await publicProfile(id);
    if (!profile) return null;
    return {
      title: `Report ${profile.name}`,
      back: { href: `/makers/${profile.slug}`, label: profile.name },
      own: id === viewer,
      ownCopy: "This is your profile, so you cannot report it.",
      preview: (
        <div className="flex items-center gap-3">
          <PersonAvatar path={profile.avatar_path} name={profile.name} />
          <div className="min-w-0">
            <p className="truncate font-medium">{profile.name}</p>
            {profile.headline && (
              <p className="truncate text-sm text-muted-foreground">{profile.headline}</p>
            )}
          </div>
        </div>
      ),
    };
  }
  // Messages are read under RLS, so only the two makers in the conversation get this far.
  const client = await serverClient();
  const { data: message, error } = await client
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("This message could not be loaded.");
  if (!message) return null;
  const sender = await publicProfile(message.sender_id);
  if (!sender) return null;
  const own = message.sender_id === viewer;
  return {
    title: "Report a message",
    back: own
      ? { href: "/messages", label: "Messages" }
      : { href: `/messages/${sender.id}`, label: sender.name },
    own,
    ownCopy: "This is your own message, so you cannot report it.",
    preview: (
      <figure className="grid gap-2">
        <figcaption className="text-sm text-muted-foreground">
          From <span className="font-medium text-foreground">{sender.name}</span>,{" "}
          <LocalTime value={message.created_at} />
        </figcaption>
        <blockquote className="w-fit max-w-full rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {message.body}
        </blockquote>
      </figure>
    ),
  };
}

export default async function Report({ params }: Props) {
  const { target, id } = await params;
  if (!isReportTarget(target) || !z.uuid().safeParse(id).success) notFound();
  const user = await currentUser();
  if (!user) redirect(`/auth?next=${encodeURIComponent(reportPath(target, id))}`);
  const found = await subject(target, id, user.id);
  if (!found) notFound();

  return (
    <Shell size="narrow">
      <BackLink href={found.back.href}>{found.back.label}</BackLink>
      <PageHeader
        className="mt-4 border-b"
        title={found.title}
        description="Tell us what is wrong. An admin reviews every report."
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 pt-8">
        <div className="rounded-xl border bg-surface p-5">{found.preview}</div>
        {found.own ? <Notice>{found.ownCopy}</Notice> : <ReportForm target={target} id={id} />}
      </div>
    </Shell>
  );
}
