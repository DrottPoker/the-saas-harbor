import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { ArrowUpRight } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { LOCALE_INFO, localizedPath } from "@/i18n/config";
import { formatList } from "@/i18n/list";
import { formatDate } from "@/lib/domain";
import {
  GUIDE_CHECKED,
  GUIDE_PUBLISHED,
  launchCautions,
  launchGroups,
  launchOrder,
  SPAM_POLICIES_URL,
  type LaunchPlace,
} from "@/lib/launch-guide";
import { availableProviders } from "@/lib/revenue/available";
import { providerNames } from "@/lib/revenue/catalog";
import { pageMetadata } from "@/lib/seo";
import { guideJsonLd } from "@/lib/structured-data";

const path = "/where-to-launch";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("whereToLaunch.meta");
  return pageMetadata({ title: t("title"), description: t("description"), path });
}

async function Place({ place, providers }: { place: LaunchPlace; providers: string }) {
  const t = await getTranslations("whereToLaunch");
  const facts = [
    [t("labels.how"), t(`places.${place.key}.how`)],
    [t("labels.cost"), t(`places.${place.key}.cost`)],
    [t("labels.bestFor"), t(`places.${place.key}.bestFor`)],
    ...(place.tip ? [[t("labels.tip"), t(`places.${place.key}.tip`)]] : []),
  ];
  return (
    <article
      aria-labelledby={`place-${place.key}`}
      className="rounded-xl border bg-surface p-5 leading-7 shadow-card"
    >
      <h3 id={`place-${place.key}`} className="font-semibold">
        {place.internal ? (
          <Link href={place.url} className="hover:underline">
            {place.name}
          </Link>
        ) : (
          <a
            href={place.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {place.name}
            <ArrowUpRight
              aria-hidden="true"
              className="size-4 text-muted-foreground rtl:-scale-x-100"
            />
            <span className="sr-only">{t("labels.newTab")}</span>
          </a>
        )}
      </h3>
      <p className="mt-1 text-foreground/85">{t(`places.${place.key}.summary`, { providers })}</p>
      <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
        {facts.map(([label, text]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="max-sm:mb-1">{text}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

// A guide to launching a new SaaS, with The SaaS Harbor as one place among others. What it says
// about other sites was checked on GUIDE_CHECKED and links to their own rules.
export default async function WhereToLaunch() {
  const [t, locale] = await Promise.all([getTranslations("whereToLaunch"), getLocale()]);
  const providers = formatList(providerNames(availableProviders()), locale, "disjunction");
  return (
    <Shell size="narrow">
      <JsonLd
        data={guideJsonLd({
          path: localizedPath(locale, path),
          headline: t("meta.title"),
          description: t("meta.description"),
          published: GUIDE_PUBLISHED,
          modified: GUIDE_CHECKED,
          places: launchGroups.flatMap((group) => group.places),
        })}
      />
      <PageHeader title={t("meta.title")} description={t("meta.description")} />
      <p className="text-sm text-muted-foreground">
        {t("checked", { date: formatDate(GUIDE_CHECKED, LOCALE_INFO[locale].intl) })}
      </p>
      <div className="mt-10 grid gap-12 border-t pt-10">
        <section aria-labelledby="order">
          <h2 id="order" className="text-lg font-semibold">
            {t("order.title")}
          </h2>
          <ol className="mt-3 grid list-decimal gap-2 ps-5 leading-7 text-foreground/85 marker:text-faint-foreground">
            {launchOrder.map((step) => (
              <li key={step}>{t(`order.${step}`)}</li>
            ))}
          </ol>
        </section>
        {launchGroups.map((group) => (
          <section key={group.id} aria-labelledby={group.id}>
            <h2 id={group.id} className="text-lg font-semibold">
              {t(`groups.${group.key}.title`)}
            </h2>
            <p className="mt-2 leading-7 text-foreground/85">{t(`groups.${group.key}.intro`)}</p>
            <div className="mt-5 grid gap-4">
              {group.places.map((place) => (
                <Place key={place.key} place={place} providers={providers} />
              ))}
            </div>
          </section>
        ))}
        <section aria-labelledby="cautions">
          <h2 id="cautions" className="text-lg font-semibold">
            {t("cautions.title")}
          </h2>
          <ul className="mt-3 grid list-disc gap-2 ps-5 leading-7 text-foreground/85 marker:text-faint-foreground">
            {launchCautions.map((caution) => (
              <li key={caution}>{t(`cautions.${caution}`)}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            {t.rich("cautions.source", {
              link: (chunks) => (
                <a
                  href={SPAM_POLICIES_URL}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-medium text-foreground underline"
                >
                  {chunks}
                  <span className="sr-only"> {t("labels.newTab")}</span>
                </a>
              ),
            })}
          </p>
        </section>
        <div className="grid gap-3">
          <p className="leading-7 text-foreground/85">{t("closing")}</p>
          <div>
            <Button asChild>
              <Link href="/list-your-saas">{t("cta")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
