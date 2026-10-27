import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { categoryChip } from "@/components/explore";
import { JsonLd } from "@/components/json-ld";
import { PageHeader, Shell } from "@/components/shell";
import { LOCALE_INFO } from "@/i18n/config";
import { techGroupKey } from "@/i18n/names";
import { techCounts } from "@/lib/data";
import { formatCount } from "@/lib/display-money";
import { categorySlug } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";
import { techsJsonLd } from "@/lib/structured-data";
import { techGroups, technologies } from "@/lib/tech";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("lists.techs");
  return pageMetadata({ title: t("title"), description: t("description"), path: "/tech" });
}

export default async function TechStacks() {
  const [counts, t, groups, locale] = await Promise.all([
    techCounts(),
    getTranslations("lists.techs"),
    getTranslations("tech"),
    getLocale(),
  ]);
  return (
    <Shell>
      <JsonLd data={techsJsonLd(technologies)} />
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-10">
        {techGroups.map((group) => (
          // An id holds no spaces: aria-labelledby reads one as a list of ids.
          <section key={group} aria-labelledby={`group-${categorySlug(group)}`}>
            <h2 id={`group-${categorySlug(group)}`} className="mb-3 font-semibold">
              {groups(techGroupKey(group))}
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {technologies
                .filter((tech) => tech.group === group)
                .map((tech) => {
                  const products = counts.get(tech.slug)?.products ?? 0;
                  return (
                    <li key={tech.slug}>
                      <Link href={`/tech/${tech.slug}`} className={categoryChip}>
                        <bdi>{tech.name}</bdi>
                        {!!products && (
                          <span className="ms-1.5 text-faint-foreground tabular-nums">
                            <span aria-hidden="true">
                              {formatCount(products, LOCALE_INFO[locale].intl)}
                            </span>
                            <span className="sr-only">{` ${t("count", { count: products })}`}</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}
