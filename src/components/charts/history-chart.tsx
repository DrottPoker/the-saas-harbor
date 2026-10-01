"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { ChartPoint, MrrChartModel, RevenueBar, RevenueChartModel } from "@/lib/charts";
import { cn } from "@/lib/utils";

/** One choice of period: its button label, its chart and its caption, all made on the server. */
export type ChartPeriod = {
  label: string;
  /** The button's name for screen readers, starting with the label. */
  name: string;
  model: MrrChartModel | RevenueChartModel;
  /** Beside the figure while no month is chosen: the change over the period, or what it covers. */
  caption: ReactNode;
};

/** A chart the reader can switch to: its tab, title and periods, and what follows the plot. */
export type ChartView = {
  id: string;
  tab: string;
  title: string;
  periods: ChartPeriod[];
  /** The note on the figures and the table view, made on the server. */
  details: ReactNode;
};

// The plot is laid out in percentages, so it renders on the server at any width with no
// measuring. Paths use a 1000-unit box stretched to the plot with non-scaling strokes; dots,
// columns and labels are HTML so they never distort.
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

/** The line and its fading area, drawn again whenever the chart mounts. */
function Line({ model, active }: { model: MrrChartModel; active: number | null }) {
  const gradientId = useId();
  const { points } = model;
  const end = points.at(-1)!;
  const shown = active == null ? null : points[active];
  return (
    <>
      <svg
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
    </>
  );
}

/**
 * A column per month, at most 24 px wide, subscriptions below and one-time purchases above with
 * a 2 px gap; the top end is rounded. Pointing at a month dims the others.
 */
function Columns({ model, active }: { model: RevenueChartModel; active: number | null }) {
  const count = model.bars.length;
  return model.bars.map((bar, i) => {
    const parts = bar.parts
      ? [
          { key: "subscription", share: bar.parts.subscription.share, color: "bg-chart-1" },
          { key: "one-time", share: bar.parts.oneTime.share, color: "bg-chart-2" },
        ].filter((part) => part.share > 0)
      : [{ key: "revenue", share: 1, color: "bg-chart-1" }];
    return (
      <div
        key={bar.month}
        aria-hidden="true"
        className={cn(
          "absolute bottom-0 flex origin-bottom -translate-x-1/2 animate-rise flex-col-reverse gap-0.5 transition-opacity",
          active != null && active !== i && "opacity-45",
        )}
        style={{
          left: `${bar.x * 100}%`,
          width: `min(24px, ${(60 / count).toFixed(3)}%)`,
          height: `${bar.height * 100}%`,
          animationDelay: `${i * 30}ms`,
        }}
      >
        {bar.height > 0 &&
          parts.map((part, index) => (
            <div
              key={part.key}
              className={cn(part.color, index === parts.length - 1 && "rounded-t")}
              style={{ flexGrow: part.share, flexBasis: 0 }}
            />
          ))}
      </div>
    );
  });
}

/** The parts of a split revenue chart, with the period's amounts or the chosen month's. */
function Legend({ parts }: { parts: { subscription: string; oneTime: string } }) {
  const items = [
    { label: "Subscriptions", value: parts.subscription, color: "bg-chart-1" },
    { label: "One-time purchases", value: parts.oneTime, color: "bg-chart-2" },
  ];
  return (
    <ul aria-label="Legend" className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("size-2.5 rounded-xs", item.color)} />
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-medium tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One chart: its figure at the top (the latest month-end MRR, or a period's revenue) with its
 * caption, where pointing at or stepping through a month shows that month instead, and the plot.
 */
function Chart({ title, period }: { title: string; period: ChartPeriod }) {
  const { model, caption } = period;
  const marks: (ChartPoint | RevenueBar)[] = model.kind === "line" ? model.points : model.bars;
  const last = marks.length - 1;
  const [active, setActive] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const summaryId = useId();
  const shown = active == null ? null : marks[active]!;
  const parts =
    model.kind === "bars" && model.totalParts
      ? shown && "parts" in shown && shown.parts
        ? { subscription: shown.parts.subscription.value, oneTime: shown.parts.oneTime.value }
        : model.totalParts
      : null;
  const figure = shown?.value ?? (model.kind === "line" ? model.points[last]!.value : model.total);

  function pick(event: PointerEvent) {
    const box = plot.current?.getBoundingClientRect();
    if (!box?.width) return;
    const fraction = (event.clientX - box.left) / box.width;
    // A line's months sit on its points; columns fill a band each.
    const index =
      model.kind === "line" ? Math.round(fraction * last) : Math.floor(fraction * marks.length);
    setActive(Math.min(last, Math.max(0, index)));
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
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
          {figure}
        </span>
        <span className="text-sm text-muted-foreground">
          {shown ? shown.label : (caption ?? marks[last]!.label)}
        </span>
      </p>

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
          {model.summary}
        </p>
        <p aria-live="polite" className="sr-only">
          {shown
            ? `${shown.label}: ${shown.value}${
                parts
                  ? `, subscriptions ${parts.subscription}, one-time purchases ${parts.oneTime}`
                  : ""
              }`
            : ""}
        </p>

        {/* Y axis labels, aligned to the gridlines. */}
        <div aria-hidden="true" className="absolute top-2 bottom-8 left-0 w-12">
          {model.ticks.map((tick) => (
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
          {model.ticks.map((tick) => (
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
          {model.kind === "line" ? (
            <Line model={model} active={active} />
          ) : (
            <Columns model={model} active={active} />
          )}
        </div>

        {/* X axis labels; narrow screens show every other month, always keeping the latest. */}
        <div aria-hidden="true" className="absolute right-3 bottom-0 left-16 h-5">
          {marks.map((mark) => (
            <span
              key={mark.month}
              className="absolute top-0 -translate-x-1/2 text-xs whitespace-nowrap text-faint-foreground"
              style={{ left: `${mark.x * 100}%` }}
            >
              <span className="max-sm:hidden">{mark.axisLabel}</span>
              <span className="sm:hidden">{mark.narrowLabel}</span>
            </span>
          ))}
        </div>
      </div>
      {parts && <Legend parts={parts} />}
    </>
  );
}

/**
 * Revenue charts with a choice of period, and with tabs where there is more than one, such as MRR
 * and revenue by month. The period chosen carries over to the other chart where it offers it.
 * The heading is the shown chart's title, under `titleId`.
 */
export function HistoryCharts({ views, titleId }: { views: ChartView[]; titleId: string }) {
  const [tab, setTab] = useState(0);
  // The whole history (the last period) until the reader chooses another.
  const [chosen, setChosen] = useState<string | null>(null);
  const baseId = useId();
  const view = views[tab]!;
  const found = view.periods.findIndex((option) => option.label === chosen);
  const period = found < 0 ? view.periods.length - 1 : found;
  const tabs = views.length > 1;
  const tabId = (index: number) => `${baseId}-tab-${views[index]!.id}`;
  const panelId = `${baseId}-panel`;
  const heading = (
    <h2 id={titleId} className={cn("text-sm text-muted-foreground", tabs && "mt-4")}>
      {view.title}
    </h2>
  );

  // Tabs follow the arrow keys, as a tab list does.
  function switchTab(event: KeyboardEvent) {
    const next = {
      ArrowLeft: (tab - 1 + views.length) % views.length,
      ArrowRight: (tab + 1) % views.length,
      Home: 0,
      End: views.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {tabs ? (
          <div
            role="tablist"
            aria-label="Chart"
            onKeyDown={switchTab}
            className="flex rounded-lg border bg-subtle p-0.5"
          >
            {views.map((option, index) => (
              <button
                key={option.id}
                id={tabId(index)}
                type="button"
                role="tab"
                aria-selected={index === tab}
                aria-controls={panelId}
                tabIndex={index === tab ? 0 : -1}
                onClick={() => setTab(index)}
                className="rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:bg-surface aria-selected:text-foreground aria-selected:shadow-control"
              >
                {option.tab}
              </button>
            ))}
          </div>
        ) : (
          heading
        )}
        {view.periods.length > 1 && (
          <div
            role="group"
            aria-label="Chart period"
            className="flex rounded-lg border bg-subtle p-0.5"
          >
            {view.periods.map((option, index) => (
              <button
                key={option.label}
                type="button"
                aria-label={option.name}
                aria-pressed={index === period}
                onClick={() => setChosen(option.label)}
                className="rounded-md px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-control"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        id={panelId}
        role={tabs ? "tabpanel" : undefined}
        aria-labelledby={tabs ? tabId(tab) : undefined}
      >
        {tabs && heading}
        {/* Keyed by chart and period, so the marks draw again and no month stays chosen. */}
        <Chart key={`${view.id}:${period}`} title={view.title} period={view.periods[period]!} />
        {view.details}
      </div>
    </>
  );
}
