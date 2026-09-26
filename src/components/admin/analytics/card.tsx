"use client";

import { type Range } from "@/lib/analytics-reports";
import { cn } from "@/lib/utils";
import { PeriodControl } from "./controls";

/**
 * One card of the Analytics page: its title, its own period, and its report. While a new period
 * loads, the last one stays in view, dimmed, so nothing jumps; before the first one arrives a
 * placeholder holds the space.
 */
export function AnalyticsCard({
  id,
  title,
  description,
  range,
  onRange,
  loading,
  error,
  onRetry,
  ready,
  placeholder = "h-56",
  className,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  range?: Range;
  onRange?: (range: Range) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Whether there is a report to show yet. */
  ready: boolean;
  placeholder?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("min-w-0 rounded-xl border bg-surface p-4 sm:p-5", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {range && onRange && (
          <PeriodControl label={`Period for ${title}`} value={range} onChange={onRange} />
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          This report could not be loaded.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            Try again
          </button>
        </p>
      )}
      <div
        aria-busy={loading}
        className={cn("mt-4 transition-opacity", loading && ready && "opacity-50")}
      >
        {ready ? (
          children
        ) : (
          <div
            aria-hidden="true"
            className={cn("animate-pulse rounded-lg bg-muted", placeholder)}
          />
        )}
      </div>
    </section>
  );
}

/** A key figure in a card; as a button it picks what the card's chart shows. */
export function Stat({
  label,
  value,
  detail,
  pressed,
  onPress,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  pressed?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="mt-1 block text-xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="mt-0.5 block min-h-4">{detail}</span>
    </>
  );
  const frame = "rounded-lg border px-3 py-2.5 text-left";
  return onPress ? (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        frame,
        "transition-colors hover:border-border-strong aria-pressed:border-foreground aria-pressed:bg-subtle",
      )}
    >
      {body}
    </button>
  ) : (
    <div className={frame}>{body}</div>
  );
}
