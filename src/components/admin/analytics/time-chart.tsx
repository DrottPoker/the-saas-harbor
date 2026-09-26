"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { chartAxis, labelIndices } from "@/lib/analytics-reports";
import { cn } from "@/lib/utils";

export type ChartPoint = {
  key: string;
  /** The short label on the axis, such as Sep 26. */
  axis: string;
  /** The full label in the tooltip and table. */
  title: string;
  value: number | null;
  /** The same point of the previous period, when there is one. */
  previous?: { title: string; value: number | null } | null;
};

// Laid out in percentages, so it needs no measuring. Paths use a 1000-unit box stretched to the
// plot with non-scaling strokes; dots, labels and the tooltip are HTML so they never distort.
const VIEW = 1000;

type Mark = { i: number; x: number; y: number };

/** Runs of known values; a gap (no value) breaks the line. */
function runs(values: (number | null)[], top: number) {
  const n = values.length;
  const result: Mark[][] = [];
  let run: Mark[] = [];
  values.forEach((value, i) => {
    if (value === null) {
      if (run.length) result.push(run);
      run = [];
      return;
    }
    run.push({ i, x: n === 1 ? 0.5 : i / (n - 1), y: 1 - Math.min(value, top) / top });
  });
  if (run.length) result.push(run);
  return result;
}

const line = (run: Mark[]) =>
  run.map((mark, i) => `${i ? "L" : "M"}${mark.x * VIEW},${mark.y * VIEW}`).join("");

function Dot({ x, y, muted }: { x: number; y: number; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute size-2 -translate-1/2 rounded-full ring-2 ring-surface",
        muted ? "bg-chart-muted" : "bg-chart-1",
      )}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  );
}

/**
 * A figure over time: an area in the accent color for the period, and a dashed line for the
 * previous period when there is one. A crosshair and tooltip follow the pointer; with focus, the
 * arrow keys step through the points. The same values are available as a table.
 */
export function TimeChart({
  label,
  points,
  format,
  whole = true,
  seriesName,
  previousName,
}: {
  label: string;
  points: ChartPoint[];
  format: (value: number) => string;
  /** Whether the figure is a count, so the axis steps in whole numbers. */
  whole?: boolean;
  seriesName: string;
  previousName?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const plot = useRef<HTMLDivElement>(null);
  const summaryId = useId();
  const n = points.length;
  const last = n - 1;
  const hasPrevious = points.some((point) => point.previous);

  const values = points.map((point) => point.value);
  const previous = points.map((point) => point.previous?.value ?? null);
  const max = Math.max(0, ...values.map((v) => v ?? 0), ...previous.map((v) => v ?? 0));
  const { top, ticks } = chartAxis(max, whole);
  const current = runs(values, top);
  const before = runs(previous, top);
  const xOf = (i: number) => (n === 1 ? 0.5 : i / (n - 1));
  const yOf = (value: number) => 1 - Math.min(value, top) / top;
  const wide = labelIndices(n, 7);
  const narrow = labelIndices(n, 4);
  const shown = active === null ? null : points[active];
  const known = values.filter((v): v is number => v !== null);
  const summary = known.length
    ? `${label}, ${points[0]?.title} to ${points[last]?.title}. Highest ${format(Math.max(...known))}, lowest ${format(Math.min(...known))}.`
    : `${label}: no data in this period.`;

  function pick(event: PointerEvent) {
    const box = plot.current?.getBoundingClientRect();
    if (!box?.width || !n) return;
    const fraction = (event.clientX - box.left) / box.width;
    setActive(Math.min(last, Math.max(0, Math.round(fraction * last))));
  }

  function step(event: KeyboardEvent) {
    const from = active ?? last;
    const next = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  }

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {hasPrevious ? (
          <ul
            aria-label="Legend"
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
          >
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-chart-1" />
              {seriesName}
            </li>
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="w-4 border-t-2 border-dashed border-chart-muted"
              />
              {previousName}
            </li>
          </ul>
        ) : (
          <span />
        )}
        <button
          type="button"
          aria-pressed={table}
          onClick={() => setTable((value) => !value)}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {table ? "Show chart" : "Show table"}
        </button>
      </div>

      {table ? (
        <div className="max-h-80 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-subtle text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-normal">
                  Period
                </th>
                <th scope="col" className="px-3 py-2 text-right font-normal">
                  {seriesName}
                </th>
                {hasPrevious && (
                  <>
                    <th
                      scope="col"
                      className="hidden px-3 py-2 text-left font-normal sm:table-cell"
                    >
                      Previous
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">
                      {previousName}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {points.map((point) => (
                <tr key={point.key}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    {point.title}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {point.value === null ? "-" : format(point.value)}
                  </td>
                  {hasPrevious && (
                    <>
                      <td className="hidden px-3 py-1.5 text-muted-foreground sm:table-cell">
                        {point.previous?.title ?? ""}
                      </td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                        {point.previous?.value == null ? "-" : format(point.previous.value)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="group"
          aria-label={`${label}. Use the arrow keys to read each point.`}
          aria-describedby={summaryId}
          onKeyDown={step}
          onFocus={() => setActive((value) => value ?? last)}
          onBlur={() => setActive(null)}
          className="relative h-56 touch-pan-y rounded-md select-none sm:h-64"
        >
          <p id={summaryId} className="sr-only">
            {summary}
          </p>
          <p aria-live="polite" className="sr-only">
            {shown
              ? `${shown.title}: ${shown.value === null ? "no data" : format(shown.value)}${
                  shown.previous
                    ? `. ${shown.previous.title}: ${shown.previous.value === null ? "no data" : format(shown.previous.value)}`
                    : ""
                }`
              : ""}
          </p>

          <div aria-hidden="true" className="absolute top-3 bottom-7 left-0 w-12">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                style={{ top: `${(1 - tick / top) * 100}%` }}
              >
                {format(tick)}
              </span>
            ))}
          </div>

          <div
            ref={plot}
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
            className="absolute top-3 right-2 bottom-7 left-14"
          >
            {ticks.map((tick) => (
              <div
                key={tick}
                aria-hidden="true"
                className={cn("absolute inset-x-0 border-t", tick === 0 && "border-border-strong")}
                style={{ top: `${(1 - tick / top) * 100}%` }}
              />
            ))}
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              {before.map((run) => (
                <path
                  key={`p${run[0].i}`}
                  d={line(run)}
                  fill="none"
                  className="stroke-chart-muted"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {current.map((run) => (
                <g key={`c${run[0].i}`}>
                  {run.length > 1 && (
                    <path
                      d={`${line(run)}L${run[run.length - 1].x * VIEW},${VIEW}L${run[0].x * VIEW},${VIEW}Z`}
                      className="fill-chart-1"
                      fillOpacity={0.1}
                    />
                  )}
                  <path
                    d={line(run)}
                    fill="none"
                    className="stroke-chart-1"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))}
            </svg>
            {/* A lone point between gaps has no line to show it. */}
            {current
              .filter((run) => run.length === 1)
              .map((run) => (
                <Dot key={`d${run[0].i}`} x={run[0].x} y={run[0].y} />
              ))}

            {shown && active !== null && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 w-px -translate-x-1/2 bg-border-strong"
                  style={{ left: `${xOf(active) * 100}%` }}
                />
                {shown.previous?.value != null && (
                  <Dot x={xOf(active)} y={yOf(shown.previous.value)} muted />
                )}
                {shown.value !== null && <Dot x={xOf(active)} y={yOf(shown.value)} />}
                <div
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute top-0 z-10 min-w-36 rounded-md border bg-surface px-2.5 py-1.5 shadow-sm",
                    xOf(active) > 0.5 ? "-translate-x-[calc(100%_+_10px)]" : "translate-x-2.5",
                  )}
                  style={{ left: `${xOf(active) * 100}%` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-0.5 w-3 rounded-full bg-chart-1" />
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {shown.value === null ? "-" : format(shown.value)}
                    </span>
                  </div>
                  <div className="text-xs whitespace-nowrap text-muted-foreground">
                    {shown.title}
                  </div>
                  {shown.previous && (
                    <>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="w-3 border-t-2 border-dashed border-chart-muted" />
                        <span className="text-sm font-medium text-foreground tabular-nums">
                          {shown.previous.value === null ? "-" : format(shown.previous.value)}
                        </span>
                      </div>
                      <div className="text-xs whitespace-nowrap text-muted-foreground">
                        {shown.previous.title}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div aria-hidden="true" className="absolute right-2 bottom-0 left-14 h-5">
            {points.map((point, i) => {
              const inWide = wide.includes(i);
              const inNarrow = narrow.includes(i);
              if (!inWide && !inNarrow) return null;
              return (
                <span
                  key={point.key}
                  className={cn(
                    "absolute top-0 text-xs whitespace-nowrap text-muted-foreground",
                    i === 0 ? "" : i === last ? "-translate-x-full" : "-translate-x-1/2",
                    !inWide && "sm:hidden",
                    !inNarrow && "max-sm:hidden",
                  )}
                  style={{ left: `${xOf(i) * 100}%` }}
                >
                  {point.axis}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </figure>
  );
}
