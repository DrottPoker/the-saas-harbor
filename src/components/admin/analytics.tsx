import Link from "next/link";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("en-US");

/** A round, even axis top at or above the largest value, so the middle line is a whole number. */
function axisTop(max: number) {
  if (max <= 2) return 2;
  const power = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 4, 6, 8, 10].map((step) => step * power).find((value) => value >= max)!;
  return top === 1 ? 2 : top;
}

/**
 * Visitors per hour, day or month as columns in `--chart-1` from one baseline, with the axis top
 * and middle marked. The same values are in a table for screen readers, and each column names its
 * figures on hover.
 */
export function VisitorsChart({
  caption,
  points,
}: {
  caption: string;
  points: { key: string; label: string; long: string; visitors: number; pageViews: number }[];
}) {
  const top = axisTop(Math.max(0, ...points.map((point) => point.visitors)));
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <figure>
      <div aria-hidden="true" className="relative h-44 sm:h-56">
        {[1, 0.5].map((share) => (
          <div
            key={share}
            className="absolute inset-x-0 flex items-center gap-2"
            style={{ top: `${(1 - share) * 100}%` }}
          >
            <span className="w-8 -translate-y-1/2 text-right text-xs text-muted-foreground tabular-nums">
              {number.format(Math.round(top * share))}
            </span>
            <span className="flex-1 -translate-y-1/2 border-t border-dashed" />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-10 flex items-end gap-px border-b sm:gap-0.5">
          {points.map((point) => (
            <div
              key={point.key}
              title={`${point.long}: ${number.format(point.visitors)} visitors, ${number.format(point.pageViews)} page views`}
              className="flex h-full min-w-0 flex-1 items-end hover:bg-muted"
            >
              <div
                className="w-full rounded-t-[3px] bg-chart-1"
                style={{ height: `${(point.visitors / top) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      {first && last && (
        <div
          aria-hidden="true"
          className="mt-1.5 ml-10 flex justify-between gap-4 text-xs text-muted-foreground"
        >
          <span>{first.label}</span>
          <span>{last.label}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Visitors</th>
            <th scope="col">Page views</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.long}</th>
              <td>{point.visitors}</td>
              <td>{point.pageViews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/**
 * The top rows of one breakdown, such as pages or countries, largest first. A tint behind each
 * label shows its share of the largest first value; the figures are in text beside it.
 */
export function RankTable({
  caption,
  heading,
  columns,
  rows,
}: {
  caption: string;
  heading: string;
  columns: string[];
  rows: { key: string; label: string; href?: string; values: number[] }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.values[0] ?? 0));
  return (
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="pb-2 pl-2 text-left font-normal">
            {heading}
          </th>
          {columns.map((column) => (
            <th key={column} scope="col" className="w-20 pb-2 pl-3 text-right font-normal">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row" className="py-0.5 text-left font-normal">
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 rounded-md bg-chart-1/15"
                  style={{ width: `${((row.values[0] ?? 0) / max) * 100}%` }}
                />
                {row.href ? (
                  <Link
                    href={row.href}
                    title={row.label}
                    className="relative block truncate px-2 py-1 hover:underline"
                  >
                    {row.label}
                  </Link>
                ) : (
                  <span title={row.label} className="relative block truncate px-2 py-1">
                    {row.label}
                  </span>
                )}
              </div>
            </th>
            {row.values.map((value, i) => (
              <td
                key={columns[i]}
                className={cn("pl-3 text-right tabular-nums", i > 0 && "text-muted-foreground")}
              >
                {number.format(value)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
