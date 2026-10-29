import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { demoActive } from "@/lib/data";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { formatList } from "@/i18n/list";
import { availableProviders } from "@/lib/revenue/available";
import { providerNames } from "@/lib/revenue/catalog";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about.meta");
  return pageMetadata({ title: t("title"), description: t("description"), path: "/about" });
}

// The first thing a new founder wants to know, before how the figures are made. Keys in about.
const steps = ["start.account", "start.provider", "start.product"] as const;

// The sections that follow, as keys in about: a title, its paragraphs, and detail that most
// readers skip, folded away.
const sections = [
  {
    title: "verified.title",
    body: ["verified.keys", "verified.mrr"],
    details: {
      summary: "verified.detailsSummary",
      body: [
        "verified.details.mrr",
        "verified.details.schedule",
        "verified.details.revenue",
        "verified.details.byMonth",
      ],
    },
  },
  {
    title: "leaderboard.title",
    body: [
      "leaderboard.ranking",
      "leaderboard.revenue",
      "leaderboard.unranked",
      "leaderboard.stats",
    ],
  },
  { title: "links.title", body: ["links.followed", "links.analytics"] },
  { title: "tech.title", body: ["tech.body"] },
  { title: "domains.title", body: ["domains.body"] },
  { title: "demo.title", demo: true, body: ["demo.body"] },
  { title: "public.title", body: ["public.defaults", "public.deletion"] },
  { title: "moderation.title", body: ["moderation.body"] },
  { title: "notThis.title", body: ["notThis.body"] },
] as const;

const textLink = (href: string) => (chunks: ReactNode) => (
  <Link className="font-medium text-foreground underline" href={href}>
    {chunks}
  </Link>
);

export default async function About() {
  // The demo section is shown only while demo products are.
  const [t, locale, demo] = await Promise.all([
    getTranslations("about"),
    getLocale(),
    demoActive(),
  ]);
  const providers = formatList(providerNames(availableProviders()), locale, "disjunction");
  const values = { providers, privacy: textLink("/privacy"), terms: textLink("/terms") };
  return (
    <Shell size="narrow">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-10 border-t pt-10">
        <section aria-labelledby="get-started">
          <h2 id="get-started" className="text-lg font-semibold">
            {t("start.title")}
          </h2>
          <ol className="mt-4 grid gap-3">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3 leading-7 text-foreground/85">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-sm font-medium text-foreground"
                >
                  {index + 1}
                </span>
                <span>{t(step, { providers })}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 leading-7 text-foreground/85">{t("start.free")}</p>
        </section>
        {sections
          .filter((section) => demo || !("demo" in section))
          .map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{t(section.title)}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="mt-3 leading-7 text-foreground/85">
                  {t.rich(paragraph, values)}
                </p>
              ))}
              {"details" in section && (
                <details className="mt-4 rounded-lg border bg-surface px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    {t(section.details.summary)}
                  </summary>
                  {section.details.body.map((paragraph) => (
                    <p key={paragraph} className="mt-3 text-sm leading-6 text-foreground/85">
                      {t(paragraph)}
                    </p>
                  ))}
                </details>
              )}
            </section>
          ))}
        <div>
          <Button asChild>
            <Link href="/dashboard/saas/new">{t("cta")}</Link>
          </Button>
        </div>
      </div>
    </Shell>
  );
}
