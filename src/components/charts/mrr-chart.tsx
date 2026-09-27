"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { MrrChartModel } from "@/lib/charts";
import { cn } from "@/lib/utils";

/** One choice of period: its button label, its chart and its change, all made on the server. */
export type ChartPeriod = {
  label: string;
  /** The button's name for screen readers, starting with the label. */
  name: string;
  model: MrrChartModel;
  change: ReactNode;
};

// The plot is laid out in percentages, so it renders on the server at any width with no
// measuring. Paths use a 1000-unit box stretched to the plot with non-scaling strokes; dots and
// labels are HTML so they never distort.
const VIEW = 1000;

function pathFor(points: MrrChartModel["points"]) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x * VIEW},${p.y * VIEW}`).join("");
}

function Dot({ x, y }: { x: number; y: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute size-2.5 -translate-1/2 rounded-full bg-chart-1 ring-3 ring-surface"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  );
}

/**
 * The MRR chart: the latest month-end figure and its change over the chosen period at the top,
 * where pointing at or stepping through a month shows that month instead, and the plot below.
 */
export function MrrChart({
  title,
  titleId,
  periods,
}: {
  title: string;
  titleId: string;
  periods: ChartPeriod[];
}) {
  // The whole history is last, and shown first.
  const [period, setPeriod] = useState(periods.length - 1);
  const { model, change } = periods[period]!;
  const { points, ticks, summary } = model;
  const last = points.length - 1;
  const [active, setActive] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const summaryId = useId();
  const gradientId = useId();
  const end = points[last]!;
  const shown = active == null ? null : points[active];

  function pick(event: PointerEvent) {
    const box = plot.current?.getBoundingClientRect();
    if (!box?.width) return;
    const fraction = (event.clientX - box.left) / box.width;
    setActive(Math.min(last, Math.max(0, Math.round(fraction * last))));
  }

  function step(event: KeyboardEvent) {
    const current = active ?? last;
    const next = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm text-muted-foreground">
            {title}
          </h2>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {(shown ?? end).value}
            </span>
            <span className="text-sm text-muted-foreground">
              {shown ? shown.label : (change ?? end.label)}
            </span>
          </p>
        </div>
        {periods.length > 1 && (
          <div
            role="group"
            aria-label="Chart period"
            className="flex rounded-lg border bg-subtle p-0.5"
          >
            {periods.map((option, index) => (
              <button
                key={option.label}
                type="button"
                aria-label={option.name}
                aria-pressed={index === period}
                onClick={() => {
                  setPeriod(index);
                  setActive(null);
                }}
                className="rounded-md px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-control"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use the arrow keys to read each month.`}
        aria-describedby={summaryId}
        onKeyDown={step}
        onFocus={() => setActive((current) => current ?? last)}
        onBlur={() => setActive(null)}
        className="relative mt-6 h-60 touch-pan-y rounded-md select-none sm:h-72"
      >
        <p id={summaryId} className="sr-only">
          {summary}
        </p>
        <p aria-live="polite" className="sr-only">
          {shown ? `${shown.label}: ${shown.value}` : ""}
        </p>

        {/* Y axis labels, aligned to the gridlines. */}
        <div aria-hidden="true" className="absolute top-2 bottom-8 left-0 w-12">
          {ticks.map((tick) => (
            <span
              key={tick.y}
              className="absolute right-0 -translate-y-1/2 font-mono text-xs text-faint-foreground tabular-nums"
              style={{ top: `${tick.y * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div
          ref={plot}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setActive(null)}
          className="absolute top-2 right-3 bottom-8 left-16"
        >
          {ticks.map((tick) => (
            <div
              key={tick.y}
              aria-hidden="true"
              className={cn(
                "absolute inset-x-0 border-t",
                // The baseline is solid; the others are faint.
                tick.y < 1 && "border-border/60",
              )}
              style={{ top: `${tick.y * 100}%` }}
            />
          ))}
          {/* Keyed by period, so the line draws again when the period changes. */}
          <svg
            key={period}
            aria-hidden="true"
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: "var(--chart-1)", stopOpacity: 0.32 }} />
                <stop offset="1" style={{ stopColor: "var(--chart-1)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <path
              d={`${pathFor(points)}L${end.x * VIEW},${VIEW}L${points[0]!.x * VIEW},${VIEW}Z`}
              fill={`url(#${gradientId})`}
              className="animate-fade-in"
              style={{ animationDelay: "500ms" }}
            />
            <path
              d={pathFor(points)}
              pathLength={1}
              strokeDasharray="1 2"
              fill="none"
              className="animate-draw stroke-chart-1"
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {shown && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-px -translate-x-1/2 bg-border-strong"
              style={{ left: `${shown.x * 100}%` }}
            />
          )}
          <Dot x={(shown ?? end).x} y={(shown ?? end).y} />
        </div>

        {/* X axis labels; narrow screens show every other month, always keeping the latest. */}
        <div aria-hidden="true" className="absolute right-3 bottom-0 left-16 h-5">
          {points.map((point) => (
            <span
              key={point.month}
              className="absolute top-0 -translate-x-1/2 text-xs whitespace-nowrap text-faint-foreground"
              style={{ left: `${point.x * 100}%` }}
            >
              <span className="max-sm:hidden">{point.axisLabel}</span>
              <span className="sm:hidden">{point.narrowLabel}</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
