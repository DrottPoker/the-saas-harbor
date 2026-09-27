import Link from "next/link";
import { Growth } from "@/components/charts/growth";
import {
  formatCount,
  formatPercent,
  formatWait,
  pointChange,
  stoppedAt,
  stoppedHref,
  type FunnelRow,
  type Range,
} from "@/lib/analytics-reports";

/**
 * The funnel's steps from sign-up to the leaderboard. A tint behind each step shows its share of
 * the sign-ups; the figures stand beside it as text, and the accounts that stopped at a step link
 * to their list. The shares and the median time show from 640 px.
 */
export function FunnelTable({
  rows,
  drop,
  caption,
  compared,
  range,
  tz,
}: {
  rows: FunnelRow[];
  /** The step before which the largest share of accounts stopped. */
  drop: FunnelRow | null;
  caption: string;
  /** The period before, as the changes name it, such as "the 30 days before". */
  compared: string;
  range: Range;
  tz: string;
}) {
  const before = drop ? rows[rows.indexOf(drop) - 1] : null;
  return (
    <div>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-2 pl-2 text-left font-normal">
              Step
            </th>
            <th scope="col" className="w-[4.5rem] pb-2 pl-2 text-right font-normal sm:w-24">
              Accounts
            </th>
            <th scope="col" className="w-[4.5rem] pb-2 pl-2 text-right font-normal sm:w-28">
              Stopped here
            </th>
            <th scope="col" className="hidden w-28 pb-2 pl-2 text-right font-normal sm:table-cell">
              Of sign-ups
            </th>
            <th scope="col" className="hidden w-32 pb-2 pl-2 text-right font-normal sm:table-cell">
              Of the step before
            </th>
            <th scope="col" className="hidden w-32 pb-2 pl-2 text-right font-normal sm:table-cell">
              Median time
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const stopped = stoppedAt(rows, index);
            const change =
              index > 0 && row.previousOfSignUps !== undefined
                ? pointChange(row.ofSignUps, row.previousOfSignUps)
                : null;
            return (
              <tr key={row.key}>
                <th scope="row" className="py-0.5 text-left font-normal">
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 rounded-md bg-chart-1/15"
                      style={{ width: `${Math.min(100, row.ofSignUps ?? 0)}%` }}
                    />
                    <span className="relative block truncate px-2 py-1" title={row.label}>
                      {row.label}
                    </span>
                  </div>
                </th>
                <td className="pl-2 text-right tabular-nums">{formatCount(row.accounts)}</td>
                <td className="pl-2 text-right tabular-nums">
                  {stopped > 0 ? (
                    <Link
                      href={stoppedHref(row.key, range, tz)}
                      className="font-medium underline underline-offset-2 hover:no-underline"
                    >
                      {formatCount(stopped)}
                      <span className="sr-only">
                        {" "}
                        {stopped === 1 ? "account" : "accounts"} stopped at {row.label}, show{" "}
                        {stopped === 1 ? "it" : "them"}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="hidden pl-2 text-right text-muted-foreground tabular-nums sm:table-cell">
                  {index === 0 ? "" : formatPercent(row.ofSignUps)}
                  {change !== null && (
                    <span className="block">
                      <Growth
                        pct={change}
                        points
                        period={{ short: null, long: `compared with ${compared}` }}
                      />
                    </span>
                  )}
                </td>
                <td className="hidden pl-2 text-right text-muted-foreground tabular-nums sm:table-cell">
                  {index === 0 ? "" : formatPercent(row.fromBefore)}
                </td>
                <td className="hidden pl-2 text-right text-muted-foreground tabular-nums sm:table-cell">
                  {index === 0 || row.key === "ranked" ? "" : formatWait(row.medianSeconds)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {before && drop && (
        <p className="mt-4 text-sm">
          The largest drop is at <span className="font-medium">{drop.label}</span>:{" "}
          {formatCount(drop.accounts)} of the {formatCount(before.accounts)}{" "}
          {before.accounts === 1 ? "account" : "accounts"} at the step before got this far (
          {formatPercent(drop.fromBefore)}).
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Each step counts the accounts that also took the steps before it, and Stopped here the
        accounts whose last step it is. Median time is from sign-up. On the leaderboard means MRR
        verified in the last 7 days and shared, today. Newer accounts have had less time.
      </p>
    </div>
  );
}
