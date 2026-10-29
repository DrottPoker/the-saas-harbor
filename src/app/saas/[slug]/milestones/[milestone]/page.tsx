import type { Metadata } from "next";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_INFO } from "@/i18n/config";
import { milestonePath, milestoneValues } from "@/lib/milestones";
import { shareLinks } from "@/lib/share";
import { providerName } from "@/lib/revenue/catalog";
import { pageMetadata, SITE_NAME, siteUrl } from "@/lib/seo";
import { ProductLogo } from "@/components/avatars";
import { CopyField } from "@/components/copy-field";
import { LocalTime } from "@/components/local-time";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { loadMilestone, type Params } from "./load";
import { localePath, localePermanentRedirect, localeRedirect } from "@/i18n/navigation";

type Props = { params: Params };

/** The milestones messages and their arguments for this page's language. */
async function words() {
  const [t, locale] = await Promise.all([getTranslations("milestones"), getLocale()]);
  return { t, intl: LOCALE_INFO[locale].intl };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await loadMilestone(params);
  if (!found || "redirect" in found) return {};
  const { item, milestone } = found;
  const { t, intl } = await words();
  const name = item.name ?? "Product";
  const values = { ...milestoneValues(milestone, intl), name };
  return {
    ...(await pageMetadata({
      title: t("meta.title", values),
      description: t("meta.description", { sentence: t("sentence", values), site: SITE_NAME }),
      path: milestonePath(item.slug ?? "", milestone),
    })),
    // The page exists to be shared; the product page is the one for search results.
    robots: { index: false, follow: true },
  };
}

export default async function MilestonePage({ params }: Props) {
  const found = await loadMilestone(params);
  if (!found) notFound();
  if ("redirect" in found) {
    // A new address for the product is lasting; a milestone that is not shown may be again.
    if (found.redirect.includes("/milestones/")) return localePermanentRedirect(found.redirect);
    return localeRedirect(found.redirect);
  }
  const { item, milestone, key, reachedAt } = found;
  const { t, intl } = await words();
  const name = item.name ?? "Product";
  const values = { ...milestoneValues(milestone, intl), name };
  const path = milestonePath(item.slug ?? "", milestone);
  // The address in the page's language, so the people a post reaches read it in that language.
  const url = `${siteUrl()}${await localePath(path)}`;
  const share = shareLinks(url, t("post", values));
  return (
    <Shell size="narrow" className="pt-6 sm:pt-8">
      <nav aria-label={t("breadcrumb")} className="mb-4 text-sm text-muted-foreground">
        <Link href="/browse" className="hover:text-foreground">
          {t("browse")}
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link
          href={`/saas/${item.slug}`}
          dir="auto"
          className="hover:text-foreground [overflow-wrap:anywhere]"
        >
          {name}
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-foreground">{t("milestone")}</span>
      </nav>

      <article className="overflow-hidden rounded-xl border bg-surface shadow-card">
        <div className="p-6 sm:p-8">
          <p className="text-sm text-muted-foreground">
            {t.rich("reachedOn", { date: () => <LocalTime format="date" value={reachedAt} /> })}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
            {t("headline", values)}
          </h1>
          <p className="mt-3 text-lg text-muted-foreground [overflow-wrap:anywhere]">
            {t("sentence", values)}{" "}
            {t("verifiedThrough", { provider: providerName(item.provider) })}
          </p>
        </div>
        <div className="flex flex-col gap-4 border-t bg-subtle p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ProductLogo path={item.logo_path} name={name} />
            <div className="min-w-0">
              <p dir="auto" className="font-medium [overflow-wrap:anywhere]">
                {name}
              </p>
              <p
                dir="auto"
                className="line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]"
              >
                {item.tagline}
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href={`/saas/${item.slug}`}>{t("viewProduct")}</Link>
          </Button>
        </div>
      </article>

      <section aria-labelledby="share" className="mt-10 grid gap-4">
        <div>
          <h2 id="share" className="text-lg font-semibold">
            {t("share.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("share.body")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={share.x} target="_blank" rel="noopener noreferrer">
              {t("share.x")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={share.linkedin} target="_blank" rel="noopener noreferrer">
              {t("share.linkedin")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${path}/opengraph-image`} download={`${item.slug}-${key}.png`}>
              {t("share.download")}
            </a>
          </Button>
        </div>
        <CopyField
          id="milestone_link"
          label={t("share.link")}
          value={url}
          copyLabel={t("share.copyLink")}
        />
      </section>
    </Shell>
  );
}
