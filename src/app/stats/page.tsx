import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/link";
import { BarList } from "@/components/charts/bar-list";
import { Growth } from "@/components/charts/growth";
import { RevenueHistory } from "@/components/charts/revenue-history";
import { ConversionNote } from "@/components/conversion-note";
import { Metric } from "@/components/metric";
import { EmptyState, PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { LOCALE_INFO } from "@/i18n/config";
import { categoryKey } from "@/i18n/names";
import { directoryStats } from "@/lib/data";
import { getMoney } from "@/lib/display-currency";
import {
  formatCount,
  formatMoney,
  formatUsdIn,
  isConverted,
  type Money,
} from "@/lib/display-money";
import { categorySlug } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";
import {
  historyPoints,
  percent,
  STATS_MINIMUM,
  statsLabels,
  type DirectoryStats,
} from "@/lib/stats";

// Until enough products share verified MRR there are no figures for search engines.
export async function generateMetadata(): Promise<Metadata> {
  const [stats, t] = await Promise.all([directoryStats(), getTranslations("stats")]);
  return {
    ...(await pageMetadata({ title: t("title"), description: t("description"), path: "/stats" })),
    ...(stats.ranked < STATS_MINIMUM && { robots: { index: false } }),
  };
}

function Panel({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-surface p-5 shadow-card">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {note && <p className="mt-0.5 text-sm text-muted-foreground">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

const cell = "py-2 text-end tabular-nums";

async function Figures({ stats, money }: { stats: DirectoryStats; money: Money }) {
  const t = await getTranslations("stats.figures");
  const tile = "rounded-xl border bg-surface shadow-card";
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric className={tile} label={t("combined")} value={formatMoney(stats.mrr_cents, money)} />
      <Metric
        className={tile}
        label={t("ranked")}
        value={formatCount(stats.ranked, money.locale)}
      />
      <Metric
        className={tile}
        label={t("median")}
        value={stats.median_mrr_cents == null ? null : formatMoney(stats.median_mrr_cents, money)}
      />
      <Metric
        className={tile}
        label={t("subscribers")}
        value={stats.customers == null ? null : formatCount(stats.customers, money.locale)}
        detail={
          <span className="text-xs text-muted-foreground">
            {t("subscribersAcross", { count: stats.customer_products })}
          </span>
        }
      />
    </dl>
  );
}

export default async function Stats() {
  const [stats, t, categoryNames, money, locale, labels] = await Promise.all([
    directoryStats(),
    getTranslations("stats"),
    getTranslations("categories"),
    getMoney(),
    getLocale(),
    statsLabels(),
  ]);
  if (stats.ranked < STATS_MINIMUM)
    return (
      <Shell>
        <PageHeader title={t("title")} description={t("description")} />
        <EmptyState
          title={t("empty.title")}
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/saas/new">{t("empty.listYourSaas")}</Link>
            </Button>
          }
        >
          {t("empty.body", { minimum: STATS_MINIMUM, count: stats.ranked })}
        </EmptyState>
      </Shell>
    );

  const intl = LOCALE_INFO[locale].intl;
  const count = (value: number) => formatCount(value, intl);
  const percentFormat = new Intl.NumberFormat(intl, { style: "percent" });
  // A count with its whole-number share of a total, such as "3 (25%)".
  const share = (part: number, total: number) =>
    t("share", { count: count(part), share: percentFormat.format(percent(part, total) / 100) });
  const history = historyPoints(stats);
  const growth = stats.growth;
  const withAge = stats.ages.reduce((sum, age) => sum + age.products, 0);
  return (
    <Shell>
      <PageHeader title={t("title")} description={t("description")} />
      <Figures stats={stats} money={money} />
      <ConversionNote className="mt-3" />
      {history.length > 1 && (
        <RevenueHistory
          history={history}
          className="mt-10"
          title={t("history.title")}
          description={t("history.description")}
        />
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {/* The database counts the buckets by US dollar amounts, so they stay in US dollars. */}
        <Panel
          id="distribution"
          title={t("distribution.title")}
          note={isConverted(money) ? t("distribution.inUsd") : undefined}
        >
          <BarList
            label={t("distribution.title")}
            rows={stats.buckets.map((bucket) => ({
              label: labels.bucket(bucket),
              value: bucket.products,
              text: share(bucket.products, stats.ranked),
            }))}
          />
        </Panel>
        <Panel
          id="growth"
          title={t("growth.title")}
          note={
            growth.median_pct == null
              ? t("growth.none")
              : t("growth.among", { count: growth.products })
          }
        >
          {growth.median_pct != null && (
            <>
              <p className="mb-5 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("growth.median")}</span>
                <Growth pct={growth.median_pct} className="text-sm" />
              </p>
              <BarList
                label={t("growth.label")}
                rows={(
                  [
                    ["growing", growth.growing],
                    ["unchanged", growth.flat],
                    ["shrinking", growth.shrinking],
                  ] as const
                ).map(([key, value]) => ({
                  label: t(`growth.${key}`),
                  value,
                  text: share(value, growth.products),
                }))}
              />
            </>
          )}
        </Panel>

        <Panel id="categories" title={t("byCategory.title")}>
          <table className="w-full text-sm">
            <caption className="sr-only">{t("byCategory.caption")}</caption>
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="py-2 text-start font-medium">
                  {t("byCategory.category")}
                </th>
                <th scope="col" className="py-2 text-end font-medium">
                  {t("byCategory.products")}
                </th>
                <th scope="col" className="py-2 text-end font-medium">
                  {t("byCategory.median")}
                </th>
                <th scope="col" className="py-2 text-end font-medium">
                  {t("byCategory.combined")}
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.categories.map((row) => (
                <tr key={row.category} className="border-b last:border-0">
                  <th scope="row" className="py-2 text-start font-normal">
                    <Link
                      href={`/categories/${categorySlug(row.category)}`}
                      className="hover:underline"
                    >
                      {categoryNames(categoryKey(row.category))}
                    </Link>
                  </th>
                  <td className={cell}>{count(row.products)}</td>
                  <td className={cell}>{formatMoney(row.median_mrr_cents, money)}</td>
                  <td className={cell}>{formatMoney(row.mrr_cents, money)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          id="ages"
          title={t("ages.title")}
          note={withAge ? t("ages.among", { count: withAge }) : undefined}
        >
          {withAge ? (
            <table className="w-full text-sm">
              <caption className="sr-only">{t("ages.caption")}</caption>
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="py-2 text-start font-medium">
                    {t("ages.launched")}
                  </th>
                  <th scope="col" className="py-2 text-end font-medium">
                    {t("ages.products")}
                  </th>
                  <th scope="col" className="py-2 text-end font-medium">
                    {t("ages.median")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.ages.map((row) => (
                  <tr key={row.min_years} className="border-b last:border-0">
                    <th scope="row" className="py-2 text-start font-normal">
                      {labels.age(row)}
                    </th>
                    <td className={cell}>{count(row.products)}</td>
                    <td className={cell}>
                      {row.median_mrr_cents == null
                        ? t("ages.none")
                        : formatMoney(row.median_mrr_cents, money)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">{t("ages.noneYet")}</p>
          )}
        </Panel>
      </div>

      {stats.fastest.length > 0 && (
        <section aria-labelledby="fastest" className="mt-10">
          <h2 id="fastest" className="text-lg font-semibold">
            {t("fastest.title")}
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            {/* The database's threshold, in US dollars. */}
            {t("fastest.description", { amount: formatUsdIn(100000, intl) })}
          </p>
          <ol className="divide-y rounded-xl border bg-surface shadow-card">
            {stats.fastest.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/saas/${item.slug}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-subtle"
                >
                  <span dir="auto" className="min-w-0 font-medium [overflow-wrap:anywhere]">
                    {item.name}
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-semibold tabular-nums">
                      {formatMoney(item.mrr_cents, money)}
                    </span>
                    <Growth pct={item.mrr_growth_pct} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="mt-8 max-w-2xl text-[13px] text-faint-foreground">
        {t("footnote")}{" "}
        <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
          {t("howVerificationWorks")}
        </Link>
      </p>
    </Shell>
  );
}
