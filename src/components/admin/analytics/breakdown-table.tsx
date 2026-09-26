"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  DIMENSIONS,
  dimensionValue,
  formatCount,
  formatDuration,
  formatPercent,
  type Breakdown,
  type BreakdownRow,
} from "@/lib/analytics-reports";
import { cn } from "@/lib/utils";

type Column = {
  label: string;
  value: (row: BreakdownRow) => string;
  /** Shown on wide screens only. */
  secondary?: boolean;
};

const visitors: Column = { label: "Visitors", value: (row) => formatCount(row.visitors) };

const columns: Record<(typeof DIMENSIONS)[keyof typeof DIMENSIONS]["kind"], Column[]> = {
  page: [
    visitors,
    { label: "Views", value: (row) => formatCount(row.page_views ?? 0) },
    {
      label: "Time on page",
      value: (row) => formatDuration(row.time_on_page ?? null),
      secondary: true,
    },
  ],
  visit: [
    visitors,
    { label: "Visits", value: (row) => formatCount(row.visits ?? 0), secondary: true },
    {
      label: "Bounce rate",
      value: (row) => formatPercent(row.bounce_rate ?? null),
      secondary: true,
    },
    { label: "Visit length", value: (row) => formatDuration(row.visit_duration ?? null) },
  ],
  exit: [
    visitors,
    { label: "Exits", value: (row) => formatCount(row.exits ?? 0) },
    { label: "Exit rate", value: (row) => formatPercent(row.exit_rate ?? null), secondary: true },
  ],
  outbound: [visitors, { label: "Clicks", value: (row) => formatCount(row.clicks ?? 0) }],
};

function Label({ report, row }: { report: Breakdown; row: BreakdownRow }) {
  const { dimension } = report;
  const text = dimensionValue(dimension, row);
  const kind = DIMENSIONS[dimension].kind;
  const link = "relative block truncate px-2 py-1 hover:underline";
  if (dimension === "outbound" && row.value)
    return (
      <a
        href={row.value}
        target="_blank"
        rel="noopener noreferrer"
        title={row.value}
        className={link}
      >
        {row.value.replace(/^https?:\/\//, "")}
        <ArrowUpRight aria-hidden="true" className="ml-0.5 inline size-3.5 text-muted-foreground" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  // Site pages open where they are; private ones with an id cannot.
  if (
    (kind === "page" || kind === "exit" || dimension === "entry_page") &&
    row.value &&
    !row.value.includes("[id]")
  )
    return (
      <Link href={row.value} title={text} className={link}>
        {text}
      </Link>
    );
  return (
    <span title={text} className="relative block truncate px-2 py-1">
      {text}
    </span>
  );
}

/**
 * The rows of one breakdown, largest first. A tint behind each label shows its share of the
 * visitors in the period; the figures stand beside it as text. Secondary figures show from 640 px.
 */
export function BreakdownTable({
  report,
  caption,
  expanded,
  onExpand,
  empty,
}: {
  report: Breakdown;
  caption: string;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
  empty: string;
}) {
  const kind = DIMENSIONS[report.dimension].kind;
  const cols = columns[kind];
  if (!report.rows.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const base = Math.max(1, report.visitors);
  return (
    <div>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-2 pl-2 text-left font-normal">
              {DIMENSIONS[report.dimension].label}
            </th>
            {cols.map((col) => (
              <th
                key={col.label}
                scope="col"
                className={cn(
                  "w-[4.5rem] pb-2 pl-2 text-right font-normal sm:w-24",
                  col.secondary && "hidden sm:table-cell",
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, index) => (
            <tr key={`${row.value}|${row.detail ?? ""}|${index}`}>
              <th scope="row" className="py-0.5 text-left font-normal">
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 rounded-md bg-chart-1/15"
                    style={{ width: `${Math.min(100, (row.visitors / base) * 100)}%` }}
                  />
                  <Label report={report} row={row} />
                </div>
              </th>
              {cols.map((col, i) => (
                <td
                  key={col.label}
                  className={cn(
                    "pl-2 text-right tabular-nums",
                    i > 0 && "text-muted-foreground",
                    col.secondary && "hidden sm:table-cell",
                  )}
                >
                  {col.value(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {report.total > report.rows.length
            ? `The top ${formatCount(report.rows.length)} of ${formatCount(report.total)}`
            : `All ${formatCount(report.total)}`}
          . Tint: share of {formatCount(report.visitors)} visitors.
        </span>
        {(report.total > 10 || expanded) && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => onExpand(!expanded)}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {expanded ? "Show the top 10" : `Show ${report.total > 100 ? "the top 100" : "all"}`}
          </button>
        )}
      </div>
    </div>
  );
}
