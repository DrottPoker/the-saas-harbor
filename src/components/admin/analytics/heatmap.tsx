"use client";

import { useState } from "react";
import { WEEKDAYS, formatCount, type Heatmap } from "@/lib/analytics-reports";
import { cn } from "@/lib/utils";

// One hue from light to dark: the share of the busiest hour, in five steps. Empty hours are muted.
const STEPS = ["bg-chart-1/15", "bg-chart-1/35", "bg-chart-1/55", "bg-chart-1/75", "bg-chart-1"];

function level(value: number, max: number) {
  if (value <= 0 || max <= 0) return null;
  return Math.min(STEPS.length - 1, Math.floor((value / max) * STEPS.length));
}

const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Visitors by weekday and hour: a cell per hour, darker for more visitors. Hovering or focusing a
 * cell names its figures; a table holds the same for screen readers.
 */
export function HeatmapChart({ report }: { report: Heatmap }) {
  const [active, setActive] = useState<{ day: number; hour: number } | null>(null);
  const cells = new Map(report.cells.map((cell) => [`${cell.day}-${cell.hour}`, cell]));
  const max = Math.max(0, ...report.cells.map((cell) => cell.visitors));
  const shown = active ? cells.get(`${active.day}-${active.hour}`) : undefined;

  return (
    <figure>
      <p aria-live="polite" className="mb-3 min-h-5 text-sm">
        {active ? (
          <>
            <span className="font-medium">
              {WEEKDAYS[active.day - 1]} {hour(active.hour)} to {hour((active.hour + 1) % 24)}:
            </span>{" "}
            <span className="tabular-nums">
              {formatCount(shown?.visitors ?? 0)} visitors, {formatCount(shown?.page_views ?? 0)}{" "}
              page views
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Hover over or tab to an hour to see its figures.
          </span>
        )}
      </p>
      <div
        aria-hidden="true"
        className="grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[2px]"
        onPointerLeave={() => setActive(null)}
      >
        {WEEKDAYS.map((name, d) => (
          <div key={name} className="contents">
            <span className="self-center pr-1 text-xs text-muted-foreground">{name}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const cell = cells.get(`${d + 1}-${h}`);
              const step = level(cell?.visitors ?? 0, max);
              const selected = active?.day === d + 1 && active.hour === h;
              return (
                <span
                  key={h}
                  onPointerEnter={() => setActive({ day: d + 1, hour: h })}
                  className={cn(
                    "aspect-square min-h-2.5 rounded-[3px] sm:aspect-auto sm:h-6",
                    step === null ? "bg-muted" : STEPS[step],
                    selected && "ring-2 ring-foreground",
                  )}
                />
              );
            })}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="pt-1 text-center text-xs text-muted-foreground">
            {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
          </span>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="mt-3 flex items-center justify-end gap-1.5 text-xs text-muted-foreground"
      >
        Fewer
        <span className="size-3 rounded-[3px] bg-muted" />
        {STEPS.map((step) => (
          <span key={step} className={cn("size-3 rounded-[3px]", step)} />
        ))}
        More
      </div>
      {/* Keyboard and screen reader access: one focusable list of the busy hours, as a table. */}
      <table className="sr-only">
        <caption>Visitors by weekday and hour</caption>
        <thead>
          <tr>
            <th scope="col">Day and hour</th>
            <th scope="col">Visitors</th>
            <th scope="col">Page views</th>
          </tr>
        </thead>
        <tbody>
          {report.cells.map((cell) => (
            <tr key={`${cell.day}-${cell.hour}`}>
              <th scope="row">
                <button
                  type="button"
                  onFocus={() => setActive({ day: cell.day, hour: cell.hour })}
                  onBlur={() => setActive(null)}
                >
                  {WEEKDAYS[cell.day - 1]} {hour(cell.hour)}
                </button>
              </th>
              <td>{cell.visitors}</td>
              <td>{cell.page_views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
