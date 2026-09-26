"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Small columns from one baseline, one per point, such as page views per minute. Each column is
 * its own hover target and names its figure; a table holds the same for screen readers.
 */
export function ColumnChart({
  caption,
  points,
  unit,
}: {
  caption: string;
  points: { key: string; label: string; value: number }[];
  unit: [string, string];
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((point) => point.value));
  const shown = active === null ? null : points[active];
  const noun = (value: number) => (value === 1 ? unit[0] : unit[1]);
  return (
    <figure>
      <p className="mb-2 min-h-5 text-xs text-muted-foreground" aria-hidden="true">
        {shown ? (
          <>
            <span className="font-medium text-foreground tabular-nums">
              {shown.value} {noun(shown.value)}
            </span>{" "}
            {shown.label}
          </>
        ) : (
          caption
        )}
      </p>
      <div
        aria-hidden="true"
        className="flex h-20 items-end gap-[2px] border-b border-border-strong"
        onPointerLeave={() => setActive(null)}
      >
        {points.map((point, i) => (
          <div
            key={point.key}
            onPointerEnter={() => setActive(i)}
            className="flex h-full min-w-0 flex-1 items-end hover:bg-subtle"
          >
            <div
              className={cn("w-full rounded-t-[3px] bg-chart-1", active === i && "opacity-70")}
              style={{ height: point.value ? `max(3px, ${(point.value / max) * 100}%)` : 0 }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.label}</th>
              <td>
                {point.value} {noun(point.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
