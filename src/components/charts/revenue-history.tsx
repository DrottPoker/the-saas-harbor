import {
  changePct,
  chartPeriods,
  monthLabel,
  mrrChartModel,
  revenueChartModel,
  type MrrPoint,
  type RevenuePoint,
} from "@/lib/charts";
import { cn } from "@/lib/utils";
import { Growth } from "./growth";
import { HistoryCharts, type ChartPeriod, type ChartView } from "./history-chart";

function monthsText(months: number) {
  return months === 1 ? "month" : `${months} months`;
}

function Table({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: { key: string; cells: string[] }[];
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
        Show as table
      </summary>
      <table
        className={cn("mt-3 w-full tabular-nums", columns.length > 2 ? "max-w-xl" : "max-w-sm")}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={cn("py-1.5 font-medium", index > 0 && "pl-4 text-right")}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, cells: [first, ...rest] }) => (
            <tr key={key} className="border-b last:border-0">
              <th scope="row" className="py-1.5 text-left font-normal">
                {first}
              </th>
              {rest.map((cell, index) => (
                <td key={index} className="py-1.5 pl-4 text-right">
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
function mrrView(history: MrrPoint[], title: string, description?: string): ChartView {
  // Every period's chart and change is made here, so the client only switches between them.
  const periods: ChartPeriod[] = chartPeriods(history.length).map(({ months, label, long }) => {
    const slice = history.slice(-months);
    const pct = changePct(slice);
    return {
      label,
      name: `${label}, ${long}`,
      model: mrrChartModel(slice),
      caption:
        pct == null ? null : (
          <Growth
            pct={pct}
            period={{
              short: `in ${monthsText(months)}`,
              long: `over the last ${monthsText(months)}`,
            }}
            className="text-sm"
          />
        ),
    };
  });
  const whole = mrrChartModel(history);
  return {
    id: "mrr",
    tab: "MRR",
    title,
    periods,
    details: (
      <>
        <p className="mt-4 text-[13px] text-muted-foreground">
          {description ??
            `Month-end MRR for the last ${monthsText(history.length)}, reconstructed from paid charges and converted to USD at today's rates.`}
        </p>
        <Table
          caption={title}
          columns={["Month", "MRR"]}
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
function revenueView(history: RevenuePoint[], description?: string): ChartView {
  const title = "Revenue by month";
  const periods: ChartPeriod[] = chartPeriods(history.length).map(({ months, label, long }) => {
    const slice = history.slice(-months);
    return {
      label,
      name: `${label}, ${long}`,
      model: revenueChartModel(slice),
      caption:
        months === 1 ? `in ${monthLabel(slice[0]!.month)}` : `in the last ${monthsText(months)}`,
    };
  });
  const whole = revenueChartModel(history);
  const split = whole.totalParts !== null;
  return {
    id: "revenue",
    tab: "Revenue",
    title,
    periods,
    details: (
      <>
        <p className="mt-4 text-[13px] text-muted-foreground">
          {description ??
            `What customers paid each month${split ? ", for subscriptions and one-time purchases" : ""}, after discounts and refunds and before tax, converted to USD at today's rates.`}
        </p>
        <Table
          caption={title}
          columns={split ? ["Month", "Subscriptions", "One-time", "Revenue"] : ["Month", "Revenue"]}
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
 * them where both are given, each with a choice of period and a table view.
 */
export function RevenueHistory({
  history,
  revenue = null,
  title = "MRR at month end",
  description,
  revenueDescription,
  className,
}: {
  history: MrrPoint[] | null;
  revenue?: RevenuePoint[] | null;
  title?: string;
  /** Replaces the note on where the MRR figures come from. */
  description?: string;
  /** Replaces the note on what revenue by month counts. */
  revenueDescription?: string;
  className?: string;
}) {
  const mrr = history ? [mrrView(history, title, description)] : [];
  const paid = revenue ? [revenueView(revenue, revenueDescription)] : [];
  // A product that sells one-time purchases only opens on its revenue, not on a flat $0 line.
  const revenueFirst =
    !!history?.every((point) => point.cents === 0) && !!revenue?.some((point) => point.cents > 0);
  const views = revenueFirst ? [...paid, ...mrr] : [...mrr, ...paid];
  if (!views.length) return null;
  return (
    <section
      aria-labelledby="revenue-history"
      className={cn("rounded-xl border bg-surface p-5 shadow-card sm:p-6", className)}
    >
      <HistoryCharts views={views} titleId="revenue-history" />
    </section>
  );
}
