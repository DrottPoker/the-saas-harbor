import { getTranslations } from "next-intl/server";
import {
  changePct,
  chartPeriods,
  monthLabel,
  mrrChartModel,
  revenueChartModel,
  type ChartFormat,
  type MrrPoint,
  type RevenuePoint,
} from "@/lib/charts";
import { getMoney } from "@/lib/display-currency";
import { cn } from "@/lib/utils";
import { ClientMessages } from "../client-messages";
import { Growth } from "./growth";
import { HistoryCharts, type ChartPeriod, type ChartView } from "./history-chart";

type Words = Awaited<ReturnType<typeof getTranslations<"charts">>>;

function Table({
  caption,
  columns,
  rows,
  label,
}: {
  caption: string;
  columns: string[];
  rows: { key: string; cells: string[] }[];
  label: string;
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <table
        className={cn("mt-3 w-full tabular-nums", columns.length > 2 ? "max-w-xl" : "max-w-sm")}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-start text-muted-foreground">
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={cn("py-1.5 text-start font-medium", index > 0 && "ps-4 text-end")}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, cells: [first, ...rest] }) => (
            <tr key={key} className="border-b last:border-0">
              <th scope="row" className="py-1.5 text-start font-normal">
                {first}
              </th>
              {rest.map((cell, index) => (
                <td key={index} className="py-1.5 ps-4 text-end">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** MRR at month end, with its change over each period. */
function mrrView(
  history: MrrPoint[],
  format: ChartFormat,
  t: Words,
  title: string,
  description?: string,
): ChartView {
  // Every period's chart and change is made here, so the client only switches between them.
  const periods: ChartPeriod[] = chartPeriods(history.length, t).map(({ months, label, long }) => {
    const slice = history.slice(-months);
    const pct = changePct(slice);
    return {
      label,
      name: t("periods.name", { label, long }),
      model: mrrChartModel(slice, format),
      caption:
        pct == null ? null : (
          <Growth
            pct={pct}
            period={{
              short: t("periods.in", { months }),
              long: t("periods.over", { months }),
            }}
            className="text-sm"
          />
        ),
    };
  });
  const whole = mrrChartModel(history, format);
  return {
    id: "mrr",
    tab: t("mrr.tab"),
    title,
    periods,
    details: (
      <>
        <p className="mt-4 text-[13px] text-muted-foreground">
          {description ?? t("mrr.note", { months: history.length })}
        </p>
        <Table
          caption={title}
          label={t("table")}
          columns={[t("mrr.month"), t("mrr.value")]}
          rows={whole.points.map((point) => ({
            key: point.month,
            cells: [point.label, point.value],
          }))}
        />
      </>
    ),
  };
}

/** Revenue by month, split into subscriptions and one-time purchases where it is known. */
function revenueView(
  history: RevenuePoint[],
  format: ChartFormat,
  t: Words,
  description?: string,
): ChartView {
  const title = t("revenue.title");
  const periods: ChartPeriod[] = chartPeriods(history.length, t).map(({ months, label, long }) => {
    const slice = history.slice(-months);
    return {
      label,
      name: t("periods.name", { label, long }),
      model: revenueChartModel(slice, format),
      caption:
        months === 1
          ? t("periods.inMonth", { month: monthLabel(slice[0]!.month, format.money.locale) })
          : t("periods.inLast", { months }),
    };
  });
  const whole = revenueChartModel(history, format);
  const split = whole.totalParts !== null;
  return {
    id: "revenue",
    tab: t("revenue.tab"),
    title,
    periods,
    details: (
      <>
        <p className="mt-4 text-[13px] text-muted-foreground">
          {description ?? t(split ? "revenue.noteSplit" : "revenue.note")}
        </p>
        <Table
          caption={title}
          label={t("table")}
          columns={
            split
              ? [
                  t("revenue.month"),
                  t("revenue.subscriptions"),
                  t("revenue.oneTime"),
                  t("revenue.value"),
                ]
              : [t("revenue.month"), t("revenue.value")]
          }
          rows={whole.bars.map((bar) => ({
            key: bar.month,
            cells: bar.parts
              ? [bar.label, bar.parts.subscription.value, bar.parts.oneTime.value, bar.value]
              : [bar.label, bar.value],
          }))}
        />
      </>
    ),
  };
}

/**
 * Revenue charts in one card: MRR at month end and revenue by month, with tabs to switch between
 * them where both are given, each with a choice of period and a table view. Amounts are in the
 * visitor's currency and months in the page's language; the page says when amounts are converted
 * (`ConversionNote`).
 */
export async function RevenueHistory({
  history,
  revenue = null,
  title,
  description,
  revenueDescription,
  className,
}: {
  history: MrrPoint[] | null;
  revenue?: RevenuePoint[] | null;
  /** The MRR chart's title; MRR at month end by default. */
  title?: string;
  /** Replaces the note on where the MRR figures come from. */
  description?: string;
  /** Replaces the note on what revenue by month counts. */
  revenueDescription?: string;
  className?: string;
}) {
  if (!history && !revenue) return null;
  const [t, money] = await Promise.all([getTranslations("charts"), getMoney()]);
  const format: ChartFormat = { money, t };
  const mrr = history ? [mrrView(history, format, t, title ?? t("mrr.title"), description)] : [];
  const paid = revenue ? [revenueView(revenue, format, t, revenueDescription)] : [];
  // A product that sells one-time purchases only opens on its revenue, not on a flat $0 line.
  const revenueFirst =
    !!history?.every((point) => point.cents === 0) && !!revenue?.some((point) => point.cents > 0);
  const views = revenueFirst ? [...paid, ...mrr] : [...mrr, ...paid];
  return (
    <section
      aria-labelledby="revenue-history"
      className={cn("rounded-xl border bg-surface p-5 shadow-card sm:p-6", className)}
    >
      <ClientMessages namespaces={["charts"]}>
        <HistoryCharts views={views} titleId="revenue-history" />
      </ClientMessages>
    </section>
  );
}
