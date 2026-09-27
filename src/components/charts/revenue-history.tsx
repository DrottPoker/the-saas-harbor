import { changePct, chartPeriods, mrrChartModel, type MrrPoint } from "@/lib/charts";
import { cn } from "@/lib/utils";
import { Growth } from "./growth";
import { MrrChart, type ChartPeriod } from "./mrr-chart";

function monthsText(months: number) {
  return months === 1 ? "month" : `${months} months`;
}

/** An MRR chart with a choice of period, and a table view of the whole history. */
export function RevenueHistory({
  history,
  title = "MRR at month end",
  description,
  className,
}: {
  history: MrrPoint[];
  title?: string;
  /** Replaces the note on where the figures come from. */
  description?: string;
  className?: string;
}) {
  // Every period's chart and change is made here, so the client only switches between them.
  const periods: ChartPeriod[] = chartPeriods(history.length).map(({ months, label, long }) => {
    const slice = history.slice(-months);
    const pct = changePct(slice);
    return {
      label,
      name: `${label}, ${long}`,
      model: mrrChartModel(slice),
      change:
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
  const whole = periods.at(-1)!.model;
  return (
    <section
      aria-labelledby="revenue-history"
      className={cn("rounded-xl border bg-surface p-5 shadow-card sm:p-6", className)}
    >
      <MrrChart title={title} titleId="revenue-history" periods={periods} />
      <p className="mt-4 text-[13px] text-muted-foreground">
        {description ?? (
          <>
            Month-end MRR for the last {monthsText(history.length)}, reconstructed from paid charges
            and converted to USD at today&apos;s rates.
          </>
        )}
      </p>
      <details className="mt-3 text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
          Show as table
        </summary>
        <table className="mt-3 w-full max-w-sm tabular-nums">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-1.5 font-medium">
                Month
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                MRR
              </th>
            </tr>
          </thead>
          <tbody>
            {whole.points.map((point) => (
              <tr key={point.month} className="border-b last:border-0">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {point.label}
                </th>
                <td className="py-1.5 text-right">{point.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
