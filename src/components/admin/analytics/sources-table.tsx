import {
  SOURCE_DIMENSIONS,
  formatCount,
  formatPercent,
  sourceLabel,
  type SourceRow,
  type Sources,
} from "@/lib/analytics-reports";
import { cn } from "@/lib/utils";

const steps: {
  key: keyof SourceRow & ("product" | "verified" | "ranked");
  label: string;
  secondary?: boolean;
}[] = [
  { key: "product", label: "Listed a product" },
  { key: "verified", label: "Verified revenue", secondary: true },
  { key: "ranked", label: "On the leaderboard" },
];

/**
 * The funnel by where its accounts came from, most accounts first: for each row, how many of its
 * accounts took the later steps, and their share of the row. A tint behind each row shows its share
 * of the accounts. Verified revenue shows from 640 px.
 */
export function SourcesTable({ report, caption }: { report: Sources; caption: string }) {
  if (!report.rows.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No accounts were created in this period.
      </p>
    );
  const base = Math.max(1, report.accounts);
  return (
    <div>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-2 pl-2 text-left font-normal">
              {SOURCE_DIMENSIONS[report.dimension]}
            </th>
            <th scope="col" className="w-[4.5rem] pb-2 pl-2 text-right font-normal sm:w-24">
              Accounts
            </th>
            {steps.map((step) => (
              <th
                key={step.key}
                scope="col"
                className={cn(
                  "w-[4.5rem] pb-2 pl-2 text-right font-normal sm:w-32",
                  step.secondary && "hidden sm:table-cell",
                )}
              >
                {step.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => {
            const label = sourceLabel(report.dimension, row);
            return (
              <tr key={`${row.known}|${row.value}`}>
                <th scope="row" className="py-0.5 text-left font-normal">
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 rounded-md bg-chart-1/15"
                      style={{ width: `${Math.min(100, (row.accounts / base) * 100)}%` }}
                    />
                    <span
                      className={cn(
                        "relative block truncate px-2 py-1",
                        !row.known && "text-muted-foreground",
                      )}
                      title={label}
                    >
                      {label}
                    </span>
                  </div>
                </th>
                <td className="pl-2 text-right tabular-nums">{formatCount(row.accounts)}</td>
                {steps.map((step) => (
                  <td
                    key={step.key}
                    className={cn(
                      "pl-2 text-right tabular-nums",
                      step.secondary && "hidden sm:table-cell",
                    )}
                  >
                    {formatCount(row[step.key])}
                    <span className="block text-xs text-muted-foreground sm:ml-1.5 sm:inline">
                      {formatPercent((100 * row[step.key]) / row.accounts)}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        {formatCount(report.known)} of {formatCount(report.accounts)}{" "}
        {report.accounts === 1 ? "account has" : "accounts have"} a recorded source: the visit that
        led to the account, matched on the day it was made. Accounts made before sources were
        recorded, or whose visit was not counted, are Not recorded. The share is of the row&apos;s
        accounts.
      </p>
    </div>
  );
}
