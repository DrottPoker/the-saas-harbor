import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { PersonAvatar, ProductLogo } from "@/components/avatars";
import { BackLink } from "@/components/back-link";
import { ClientMessages } from "@/components/client-messages";
import { LocalTime } from "@/components/local-time";
import { ReportForm } from "@/components/report-form";
import { Notice, PageHeader, Shell } from "@/components/shell";
import { publicProfile, publicSaas } from "@/lib/data";
import { MESSAGE_COLUMNS } from "@/lib/messages";
import { isReportTarget, reportPath, type ReportTarget } from "@/lib/moderation";
import { requireUser, serverClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ target: string; id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.meta");
  return { title: t("title") };
}

// What is being reported, as the reporter sees it, and whether it is their own.
async function subject(target: ReportTarget, id: string, viewer: string) {
  const t = await getTranslations("reports.page");
  if (target === "saas") {
    const item = await publicSaas(id);
    if (!item) return null;
    const name = item.name ?? t("productFallback");
    return {
      title: t("title", { name }),
      back: { href: `/saas/${item.slug}`, label: name },
      own: item.owner_id === viewer,
      ownCopy: t("ownProduct"),
      preview: (
        <div className="flex items-center gap-3">
          <ProductLogo path={item.logo_path} name={name} />
          <div className="min-w-0">
            <p dir="auto" className="truncate font-medium">
              {item.name}
            </p>
            <p dir="auto" className="truncate text-sm text-muted-foreground">
              {item.tagline}
            </p>
          </div>
        </div>
      ),
    };
  }
  if (target === "profile") {
    const profile = await publicProfile(id);
    if (!profile) return null;
    return {
      title: t("title", { name: profile.name }),
      back: { href: `/users/${profile.slug}`, label: profile.name },
      own: id === viewer,
      ownCopy: t("ownProfile"),
      preview: (
        <div className="flex items-center gap-3">
          <PersonAvatar path={profile.avatar_path} name={profile.name} />
          <div className="min-w-0">
            <p dir="auto" className="truncate font-medium">
              {profile.name}
            </p>
            {profile.headline && (
              <p dir="auto" className="truncate text-sm text-muted-foreground">
                {profile.headline}
              </p>
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
    title: t("messageTitle"),
    back: own
      ? { href: "/messages", label: t("messages") }
      : { href: `/messages/${sender.id}`, label: sender.name },
    own,
    ownCopy: t("ownMessage"),
    preview: (
      <figure className="grid gap-2">
        <figcaption className="text-sm text-muted-foreground">
          {t.rich("from", {
            name: sender.name,
            sender: (chunks) => (
              <span dir="auto" className="font-medium text-foreground">
                {chunks}
              </span>
            ),
            time: () => <LocalTime value={message.created_at} />,
          })}
        </figcaption>
        <blockquote className="w-fit max-w-full rounded-2xl rounded-es-md bg-muted px-3.5 py-2 leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {/* The text keeps its own direction; the bubble follows the page. */}
          <span dir="auto" className="block">
            {message.body}
          </span>
        </blockquote>
      </figure>
    ),
  };
}

export default async function Report({ params }: Props) {
  const { target, id } = await params;
  if (!isReportTarget(target) || !z.uuid().safeParse(id).success) notFound();
  const { user } = await requireUser({ next: reportPath(target, id) });
  const [found, t] = await Promise.all([
    subject(target, id, user.id),
    getTranslations("reports.page"),
  ]);
  if (!found) notFound();

  return (
    <Shell size="narrow">
      <BackLink href={found.back.href}>
        <span dir="auto">{found.back.label}</span>
      </BackLink>
      <PageHeader className="mt-4 border-b" title={found.title} description={t("description")} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 pt-8">
        <div className="rounded-xl border bg-surface p-5 shadow-card">{found.preview}</div>
        {found.own ? (
          <Notice>{found.ownCopy}</Notice>
        ) : (
          <ClientMessages namespaces={["reports"]}>
            <ReportForm target={target} id={id} />
          </ClientMessages>
        )}
      </div>
    </Shell>
  );
}
