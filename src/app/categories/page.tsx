import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { JsonLd } from "@/components/json-ld";
import { PageHeader, Shell } from "@/components/shell";
import { LOCALE_INFO } from "@/i18n/config";
import { categoryKey } from "@/i18n/names";
import { categoryCounts } from "@/lib/data";
import { formatCount } from "@/lib/display-money";
import { categories, categorySlug } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";
import { categoriesJsonLd } from "@/lib/structured-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("lists.categories");
  return pageMetadata({ title: t("title"), description: t("description"), path: "/categories" });
}

export default async function Categories() {
  const [counts, t, names, locale] = await Promise.all([
    categoryCounts(),
    getTranslations("lists.categories"),
    getTranslations("categories"),
    getLocale(),
  ]);
  const countLabel = (products: number, ranked: number) =>
    !products
      ? t("none")
      : ranked
        ? t("countRanked", {
            count: products,
            ranked: formatCount(ranked, LOCALE_INFO[locale].intl),
          })
        : t("count", { count: products });
  return (
    <Shell>
      <JsonLd data={categoriesJsonLd([...categories])} />
      <PageHeader title={t("title")} description={t("description")} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const count = counts.get(category) ?? { products: 0, ranked: 0 };
          return (
            <li key={category}>
              <Link
                href={`/categories/${categorySlug(category)}`}
                className="flex h-full flex-col gap-1 rounded-xl border bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised"
              >
                <span className="font-medium">{names(categoryKey(category))}</span>
                <span className="text-sm text-muted-foreground">
                  {countLabel(count.products, count.ranked)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
