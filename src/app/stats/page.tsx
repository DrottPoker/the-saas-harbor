import Link from "next/link";
import { BarList } from "@/components/charts/bar-list";
import { Growth } from "@/components/charts/growth";
import { RevenueHistory } from "@/components/charts/revenue-history";
import { Metric } from "@/components/metric";
import { EmptyState, PageHeader, Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { directoryStats } from "@/lib/data";
import { categorySlug, formatUsd } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";
import {
  ageLabel,
  bucketLabel,
  historyPoints,
  percent,
  STATS_MINIMUM,
  type DirectoryStats,
} from "@/lib/stats";

const description =
  "Monthly recurring revenue across the products that share it, verified through their payment providers.";

export const metadata = pageMetadata({ title: "Statistics", description, path: "/stats" });

const products = (count: number) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? "product" : "products"}`;

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
    <section aria-labelledby={id} className="rounded-xl border bg-surface p-5">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {note && <p className="mt-0.5 text-sm text-muted-foreground">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

const cell = "py-2 text-right tabular-nums";

function Figures({ stats }: { stats: DirectoryStats }) {
  const tile = "rounded-xl border bg-surface";
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric className={tile} label="Verified MRR, combined" value={formatUsd(stats.mrr_cents)} />
      <Metric
        className={tile}
        label="Products ranked"
        value={stats.ranked.toLocaleString("en-US")}
      />
      <Metric
        className={tile}
        label="Median MRR"
        value={stats.median_mrr_cents == null ? null : formatUsd(stats.median_mrr_cents)}
      />
      <Metric
        className={tile}
        label="Paying customers"
        value={stats.customers == null ? null : stats.customers.toLocaleString("en-US")}
        detail={
          <span className="text-xs text-muted-foreground">
            Across the {products(stats.customer_products)} that share them
          </span>
        }
      />
    </dl>
  );
}

export default async function Stats() {
  const stats = await directoryStats();
  if (stats.ranked < STATS_MINIMUM)
    return (
      <Shell>
        <PageHeader title="Statistics" description={description} />
        <EmptyState
          title="Not enough products yet"
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/saas/new">Submit your SaaS</Link>
            </Button>
          }
        >
          Statistics appear once {STATS_MINIMUM} products share verified MRR.{" "}
          {stats.ranked === 1 ? "1 product does" : `${stats.ranked} products do`} so now.
        </EmptyState>
      </Shell>
    );

  const history = historyPoints(stats);
  const growth = stats.growth;
  const withAge = stats.ages.reduce((sum, age) => sum + age.products, 0);
  return (
    <Shell>
      <PageHeader title="Statistics" description={description} />
      <Figures stats={stats} />
      {history.length > 1 && (
        <RevenueHistory
          history={history}
          title="Combined MRR at month end"
          description="The MRR of the products ranked today, added up at each month end. Reconstructed from paid invoices and converted to USD at today's rates."
        />
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Panel id="distribution" title="Products by MRR">
          <BarList
            label="Products by MRR"
            rows={stats.buckets.map((bucket) => ({
              label: bucketLabel(bucket),
              value: bucket.products,
              text: `${bucket.products} (${percent(bucket.products, stats.ranked)}%)`,
            }))}
          />
        </Panel>
        <Panel
          id="growth"
          title="Change over 30 days"
          note={
            growth.median_pct == null
              ? "No product has figures from 30 days ago yet."
              : `Among the ${products(growth.products)} with figures from 30 days ago.`
          }
        >
          {growth.median_pct != null && (
            <>
              <p className="mb-5 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Median change</span>
                <Growth pct={growth.median_pct} className="text-sm" />
              </p>
              <BarList
                label="Products by change over 30 days"
                rows={[
                  ["Growing", growth.growing],
                  ["Unchanged", growth.flat],
                  ["Shrinking", growth.shrinking],
                ].map(([label, value]) => ({
                  label: label as string,
                  value: value as number,
                  text: `${value} (${percent(value as number, growth.products)}%)`,
                }))}
              />
            </>
          )}
        </Panel>

        <Panel id="categories" title="By category">
          <table className="w-full text-sm">
            <caption className="sr-only">Ranked products by category</caption>
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="py-2 text-left font-medium">
                  Category
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Products
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Median MRR
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Combined
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.categories.map((row) => (
                <tr key={row.category} className="border-b last:border-0">
                  <th scope="row" className="py-2 text-left font-normal">
                    <Link
                      href={`/categories/${categorySlug(row.category)}`}
                      className="hover:underline"
                    >
                      {row.category}
                    </Link>
                  </th>
                  <td className={cell}>{row.products}</td>
                  <td className={cell}>{formatUsd(row.median_mrr_cents)}</td>
                  <td className={cell}>{formatUsd(row.mrr_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          id="ages"
          title="By time since launch"
          note={
            withAge ? `Among the ${products(withAge)} that share their launch date.` : undefined
          }
        >
          {withAge ? (
            <table className="w-full text-sm">
              <caption className="sr-only">Ranked products by time since launch</caption>
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="py-2 text-left font-medium">
                    Launched
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Products
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Median MRR
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.ages.map((row) => (
                  <tr key={row.min_years} className="border-b last:border-0">
                    <th scope="row" className="py-2 text-left font-normal">
                      {ageLabel(row)}
                    </th>
                    <td className={cell}>{row.products}</td>
                    <td className={cell}>
                      {row.median_mrr_cents == null ? "None" : formatUsd(row.median_mrr_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No ranked product shares its launch date yet.
            </p>
          )}
        </Panel>
      </div>

      {stats.fastest.length > 0 && (
        <section aria-labelledby="fastest" className="mt-10">
          <h2 id="fastest" className="text-lg font-semibold">
            Fastest growing
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            The largest change over 30 days among products with at least $1,000 MRR.
          </p>
          <ol className="divide-y rounded-xl border bg-surface">
            {stats.fastest.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/saas/${item.slug}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-subtle"
                >
                  <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{item.name}</span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-semibold tabular-nums">{formatUsd(item.mrr_cents)}</span>
                    <Growth pct={item.mrr_growth_pct} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="mt-8 max-w-2xl text-[13px] text-faint-foreground">
        These figures come from the leaderboard: products that share MRR verified in the last seven
        days. Demo products are never counted.{" "}
        <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
          How verification works
        </Link>
      </p>
    </Shell>
  );
}
