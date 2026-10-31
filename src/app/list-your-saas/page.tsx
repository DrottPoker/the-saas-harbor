import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { ArrowRight, Check } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { localizedPath } from "@/i18n/config";
import { formatList } from "@/i18n/list";
import { DAILY_PRODUCT_LIMIT, PRODUCT_LIMIT } from "@/lib/moderation";
import { availableProviders } from "@/lib/revenue/available";
import { providerNames } from "@/lib/revenue/catalog";
import { listingSettings } from "@/lib/listing-settings";
import { pageMetadata } from "@/lib/seo";
import { faqJsonLd, type FaqItem } from "@/lib/structured-data";
import { currentUser } from "@/lib/supabase/server";

const path = "/list-your-saas";

// For founders deciding where to list a new SaaS, and for the search engines and AI assistants
// they ask. Every statement describes how the site works today.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("listYourSaas.meta");
  return pageMetadata({ title: t("title"), description: t("description"), path });
}

// The page's lists, as keys in listYourSaas.
const gains = [
  "gains.page",
  "gains.lists",
  "gains.profile",
  "gains.views",
  "gains.leaderboard",
  "gains.badge",
] as const;

const differences = [
  "differences.free",
  "differences.noQueue",
  "differences.noPaidPlacements",
  "differences.readOnly",
  "differences.dofollow",
  "differences.indexing",
] as const;

const steps = ["steps.account", "steps.provider", "steps.product", "steps.extras"] as const;

// The questions in listYourSaas.faq, which the page and its structured data both show.
const questions = [
  "free",
  "noRevenue",
  "public",
  "share",
  "providers",
  "dofollow",
  "limits",
  "remove",
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-3 leading-7 text-foreground/85">{children}</div>
    </section>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <Check aria-hidden="true" className="mt-1.5 size-4 shrink-0 text-brand" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function ListYourSaas() {
  const [t, locale, user, { allowOtherProvider }] = await Promise.all([
    getTranslations("listYourSaas"),
    getLocale(),
    currentUser(),
    listingSettings(),
  ]);
  const names = providerNames(availableProviders());
  const faq: FaqItem[] = questions.map((key) => ({
    question: t(`faq.${key}.question`),
    answer: t(
      !allowOtherProvider && key === "noRevenue"
        ? "faq.noRevenue.answerRequired"
        : `faq.${key}.answer`,
      {
        providers: formatList(names, locale),
        total: PRODUCT_LIMIT,
        daily: DAILY_PRODUCT_LIMIT,
      },
    ),
  }));
  // Visitors create an account first; signed-in users go straight to the product form.
  const start = user ? "/dashboard/saas/new" : "/auth?mode=signup";
  const actions = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <Button asChild size="lg">
        <Link href={start}>
          {t("cta")}
          <ArrowRight className="rtl:-scale-x-100" />
        </Link>
      </Button>
      <Link href="/about" className="text-sm font-medium underline-offset-4 hover:underline">
        {t("howItWorks")}
      </Link>
    </div>
  );
  return (
    <Shell size="narrow">
      <JsonLd data={faqJsonLd(localizedPath(locale, path), t("title"), faq)} />
      <PageHeader
        title={t("title")}
        description={t(allowOtherProvider ? "description" : "descriptionRequired")}
      />
      {actions}
      <section
        aria-labelledby="dofollow"
        className="mt-8 rounded-xl border bg-surface p-5 leading-7 shadow-card"
      >
        <h2 id="dofollow" className="font-semibold">
          {t("dofollow.title")}
        </h2>
        <p className="mt-1 text-foreground/85">{t("dofollow.body")}</p>
      </section>
      <div className="mt-10 grid gap-10 border-t pt-10">
        <Section id="gains" title={t("gains.title")}>
          <Checks items={gains.map((key) => t(key))} />
        </Section>
        <Section id="new" title={t("newSaas.title")}>
          <p>{t("newSaas.samePage")}</p>
          <p className="mt-3">{t("newSaas.noRevenue")}</p>
        </Section>
        <Section id="differences" title={t("differences.title")}>
          <Checks items={differences.map((key) => t(key))} />
        </Section>
        <Section id="steps" title={t("steps.title")}>
          <ol className="grid list-decimal gap-2 ps-5 marker:text-faint-foreground">
            {steps.map((key) => (
              <li key={key}>
                {t(
                  !allowOtherProvider && key === "steps.provider" ? "steps.providerRequired" : key,
                  { providers: formatList(names, locale, "disjunction") },
                )}
              </li>
            ))}
          </ol>
        </Section>
        <Section id="questions" title={t("faq.title")}>
          <div className="grid gap-6">
            {faq.map(({ question, answer }) => (
              <div key={question}>
                <h3 className="font-medium text-foreground">{question}</h3>
                <p className="mt-1">{answer}</p>
              </div>
            ))}
          </div>
        </Section>
        <div className="grid gap-4">
          {actions}
          <p className="text-sm text-muted-foreground">
            {t.rich("elsewhere", {
              link: (chunks) => (
                <Link href="/where-to-launch" className="font-medium text-foreground underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </div>
    </Shell>
  );
}
