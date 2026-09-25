import { mrrChartModel, type MrrPoint } from "@/lib/charts";
import { MrrChart } from "./mrr-chart";

/** The product page's MRR chart with a table view of the same values. */
export function RevenueHistory({
  history,
  title = "MRR at month end",
  description,
}: {
  history: MrrPoint[];
  title?: string;
  /** Replaces the note on where the figures come from. */
  description?: string;
}) {
  const model = mrrChartModel(history);
  const months = history.length;
  return (
    <section aria-labelledby="revenue-history" className="mt-10 rounded-xl border bg-surface p-5">
      <h2 id="revenue-history" className="font-semibold">
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {description ?? (
          <>
            The last {months === 1 ? "month" : `${months} months`}, reconstructed from paid Stripe
            invoices and converted to USD at today&apos;s rates.
          </>
        )}
      </p>
      <div className="mt-5">
        <MrrChart model={model} />
      </div>
      <details className="mt-4 text-sm">
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
            {model.points.map((point) => (
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
