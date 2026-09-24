"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { MrrChartModel } from "@/lib/charts";
import { cn } from "@/lib/utils";

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
      className="absolute size-2 -translate-1/2 rounded-full bg-chart-1 ring-2 ring-surface"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  );
}

export function MrrChart({ model }: { model: MrrChartModel }) {
  const { points, ticks, summary } = model;
  const last = points.length - 1;
  const [active, setActive] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const summaryId = useId();
  const end = points[last];
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

  // The end label sits on the side of the dot away from the incoming line and the plot edges.
  const previous = points[last - 1];
  const endBelow = end.y < 0.25 || (end.y <= 0.8 && previous !== undefined && previous.y < end.y);

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label="MRR at month end. Use the arrow keys to read each month."
      aria-describedby={summaryId}
      onKeyDown={step}
      onFocus={() => setActive((current) => current ?? last)}
      onBlur={() => setActive(null)}
      className="relative h-56 touch-pan-y rounded-md select-none sm:h-64"
    >
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      <p aria-live="polite" className="sr-only">
        {shown ? `${shown.label}: ${shown.value}` : ""}
      </p>

      {/* Y axis labels, aligned to the gridlines. */}
      <div aria-hidden="true" className="absolute top-6 bottom-8 left-0 w-11">
        {ticks.map((tick) => (
          <span
            key={tick.y}
            className="absolute right-0 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
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
        className="absolute top-6 right-3 bottom-8 left-14"
      >
        {ticks.map((tick) => (
          <div
            key={tick.y}
            aria-hidden="true"
            className="absolute inset-x-0 border-t"
            style={{ top: `${tick.y * 100}%` }}
          />
        ))}
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <path
            d={`${pathFor(points)}L${end.x * VIEW},${VIEW}L${points[0].x * VIEW},${VIEW}Z`}
            className="fill-chart-1"
            fillOpacity={0.1}
          />
          <path
            d={pathFor(points)}
            fill="none"
            className="stroke-chart-1"
            strokeWidth={2}
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
        <Dot x={end.x} y={end.y} />
        {shown && active !== last && <Dot x={shown.x} y={shown.y} />}
        <span
          aria-hidden="true"
          className={cn(
            "absolute text-xs font-medium whitespace-nowrap text-foreground tabular-nums",
            endBelow
              ? "translate-x-[calc(-100%_+_4px)] translate-y-2.5"
              : "translate-x-[calc(-100%_+_4px)] translate-y-[calc(-100%_-_10px)]",
            shown && "opacity-0",
          )}
          style={{ left: `${end.x * 100}%`, top: `${end.y * 100}%` }}
        >
          {end.value}
        </span>

        {shown && (
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-0 z-10 rounded-md border bg-surface px-2.5 py-1.5 whitespace-nowrap shadow-sm",
              shown.x > 0.5 ? "-translate-x-[calc(100%_+_10px)]" : "translate-x-2.5",
            )}
            style={{ left: `${shown.x * 100}%` }}
          >
            <div className="text-sm font-semibold text-foreground tabular-nums">{shown.value}</div>
            <div className="text-xs text-muted-foreground">{shown.label}</div>
          </div>
        )}
      </div>

      {/* X axis labels; narrow screens show every other month, always keeping the latest. */}
      <div aria-hidden="true" className="absolute right-3 bottom-0 left-14 h-5">
        {points.map((point) => (
          <span
            key={point.month}
            className="absolute top-0 -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground"
            style={{ left: `${point.x * 100}%` }}
          >
            <span className="max-sm:hidden">{point.axisLabel}</span>
            <span className="sm:hidden">{point.narrowLabel}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
