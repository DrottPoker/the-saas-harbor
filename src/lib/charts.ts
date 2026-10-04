// Chart models for revenue history. Pure and deterministic: labels are computed here, on the
// server, so client charts only position marks and never format numbers themselves.
import { z } from "zod";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const historySchema = z
  .array(
    z.object({
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      mrr_cents: z.number().int().nonnegative(),
    }),
  )
  .min(1)
  .max(36);

export type MrrPoint = { month: string; cents: number };

/** Reads stored history (month-end MRR, oldest first). Anything malformed yields null. */
export function parseHistory(value: unknown): MrrPoint[] | null {
  const parsed = historySchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.map(({ month, mrr_cents }) => ({ month, cents: mrr_cents }));
}

const cents = z.number().int().nonnegative();
const revenueSchema = z
  .array(
    z.object({
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      cents,
      subscription_cents: cents.optional(),
      one_time_cents: cents.optional(),
    }),
  )
  .min(1)
  .max(36);

/** A month of revenue, split into what subscriptions and one-time purchases paid where known. */
export type RevenuePoint = MrrPoint & { split: { subscription: number; oneTime: number } | null };

/** Reads stored revenue by month (oldest first). Anything malformed yields null. */
export function parseRevenueHistory(value: unknown): RevenuePoint[] | null {
  const parsed = revenueSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.map(({ month, cents, subscription_cents, one_time_cents }) => ({
    month,
    cents,
    split:
      subscription_cents === undefined || one_time_cents === undefined
        ? null
        : { subscription: subscription_cents, oneTime: one_time_cents },
  }));
}

/**
 * A history from when the product had one: from the earliest of its first month with an amount,
 * its launch month and the month it was listed, so a new product's chart does not reach back to
 * months before it existed. Null when no month is left; unchanged when nothing tells a start.
 */
export function historySince<T extends MrrPoint>(
  history: T[] | null,
  { launchedOn, listedAt }: { launchedOn?: string | null; listedAt?: string | null },
): T[] | null {
  if (!history) return null;
  const starts = [history.find((p) => p.cents > 0)?.month, launchedOn, listedAt]
    .filter((date): date is string => !!date)
    .map((date) => date.slice(0, 7))
    .sort();
  if (!starts.length) return history;
  const kept = history.filter((p) => p.month >= starts[0]!);
  return kept.length ? kept : null;
}

function monthParts(month: string) {
  const [year, index] = month.split("-").map(Number);
  return { year, name: MONTHS[index - 1] };
}

export function monthLabel(month: string) {
  const { year, name } = monthParts(month);
  return `${name} ${year}`;
}

/**
 * Short month labels for the months an axis shows (null for the rest). A label carries the year
 * when it is the first one shown or the year changed since the previous one shown.
 */
function axisLabels(months: string[], shown: (index: number) => boolean) {
  let previousYear: number | null = null;
  return months.map((month, i) => {
    if (!shown(i)) return null;
    const { year, name } = monthParts(month);
    const withYear = year !== previousYear;
    previousYear = year;
    return withYear ? `${name.slice(0, 3)} ’${String(year).slice(2)}` : name.slice(0, 3);
  });
}

// Whole dollars: a reconstructed, currency-converted history is not accurate to the cent.
export function wholeUsd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

export function compactUsd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * A zero-based axis with round steps, in cents: `intervals` ± 1 intervals, choosing the
 * lowest top (then the fewest intervals) so the line uses as much of the height as it can.
 */
export function niceScale(maxCents: number, intervals = 4) {
  // At least $4, and steps of whole dollars only: $2.50 steps below $12.50 are left out.
  const max = maxCents > 0 ? Math.max(maxCents, 400) : 10_000;
  const magnitude = 10 ** Math.floor(Math.log10(max / intervals));
  const [step, steps] = [1, 2, 2.5, 5, 10]
    .map((f) => [f * magnitude, Math.ceil(max / (f * magnitude) - 1e-9)] as const)
    .filter(([s, n]) => s % 100 === 0 && n >= intervals - 1 && n <= intervals + 1)
    .sort(([a, n], [b, m]) => a * n - b * m || n - m)[0];
  return {
    max: steps * step,
    ticks: Array.from({ length: steps + 1 }, (_, i) => Math.round(i * step)),
  };
}

export type ChartPoint = {
  month: string;
  label: string;
  /** Axis labels for wide plots (every month) and narrow ones (every other, ending at the last). */
  axisLabel: string;
  narrowLabel: string | null;
  value: string;
  /** Position inside the plot as fractions: x from the left, y from the top. */
  x: number;
  y: number;
};

export type MrrChartModel = {
  kind: "line";
  points: ChartPoint[];
  ticks: { y: number; label: string }[];
  summary: string;
};

/**
 * Month labels for an axis: every month on wide plots; on narrow ones every other month, or every
 * third in a history longer than six months, so labels with a year never touch, ending at the last.
 */
function monthAxis(months: string[]) {
  const last = months.length - 1;
  const step = months.length > 6 ? 3 : 2;
  const wide = axisLabels(months, () => true);
  const narrow = axisLabels(months, (i) => (last - i) % step === 0);
  return months.map((month, i) => ({
    month,
    label: monthLabel(month),
    axisLabel: wide[i]!,
    narrowLabel: narrow[i],
  }));
}

export function mrrChartModel(history: MrrPoint[]): MrrChartModel {
  const scale = niceScale(Math.max(...history.map((p) => p.cents)));
  const last = history.length - 1;
  const axis = monthAxis(history.map((p) => p.month));
  const points = history.map((p, i) => ({
    ...axis[i]!,
    value: wholeUsd(p.cents),
    x: last === 0 ? 1 : i / last,
    y: 1 - p.cents / scale.max,
  }));
  const [first, end] = [points[0], points[last]];
  return {
    kind: "line",
    points,
    ticks: scale.ticks.map((cents) => ({ y: 1 - cents / scale.max, label: compactUsd(cents) })),
    summary:
      last === 0
        ? `MRR was ${end.value} at the end of ${end.label}.`
        : `MRR at month end went from ${first.value} in ${first.label} to ${end.value} in ${end.label}.`,
  };
}

/** A part of a month's revenue: its amount, and its share of the month's column. */
export type RevenuePart = { value: string; share: number };

/** A month's column: its total, and its parts where it is split. */
export type RevenueBar = Omit<ChartPoint, "y"> & {
  /** Height of the column as a fraction of the plot. */
  height: number;
  parts: { subscription: RevenuePart; oneTime: RevenuePart } | null;
};

export type RevenueChartModel = {
  kind: "bars";
  bars: RevenueBar[];
  ticks: { y: number; label: string }[];
  summary: string;
  /** The period's total, and what subscriptions and one-time purchases paid of it. */
  total: string;
  totalParts: { subscription: string; oneTime: string } | null;
};

/**
 * Revenue by month as columns, each in the middle of its month's band, split into subscriptions
 * and one-time purchases only when every month is, so the parts read the same across the period.
 */
export function revenueChartModel(history: RevenuePoint[]): RevenueChartModel {
  const scale = niceScale(Math.max(...history.map((p) => p.cents)));
  const axis = monthAxis(history.map((p) => p.month));
  const split = history.every((p) => p.split);
  const sum = (part: (p: RevenuePoint) => number) => history.reduce((s, p) => s + part(p), 0);
  const part = (amount: number, total: number) => ({
    value: wholeUsd(amount),
    share: total > 0 ? amount / total : 0,
  });
  const bars = history.map((p, i) => ({
    ...axis[i]!,
    value: wholeUsd(p.cents),
    x: (i + 0.5) / history.length,
    height: p.cents / scale.max,
    parts:
      split && p.split
        ? {
            subscription: part(p.split.subscription, p.cents),
            oneTime: part(p.split.oneTime, p.cents),
          }
        : null,
  }));
  const total = wholeUsd(sum((p) => p.cents));
  const [first, end] = [bars[0]!, bars.at(-1)!];
  return {
    kind: "bars",
    bars,
    ticks: scale.ticks.map((cents) => ({ y: 1 - cents / scale.max, label: compactUsd(cents) })),
    summary:
      bars.length === 1
        ? `Revenue was ${end.value} in ${end.label}.`
        : `Revenue by month from ${first.label} to ${end.label}, ${total} in total.`,
    total,
    totalParts: split
      ? {
          subscription: wholeUsd(sum((p) => p.split!.subscription)),
          oneTime: wholeUsd(sum((p) => p.split!.oneTime)),
        }
      : null,
  };
}

/**
 * The periods a revenue chart offers, as month counts: 3, 6 and 12 months where the history is
 * longer, and always the whole history, which is last and chosen first.
 */
export function chartPeriods(months: number) {
  return [...[3, 6, 12].filter((n) => n < months), months].map((n) => ({
    months: n,
    label: n < months ? (n === 12 ? "1Y" : `${n}M`) : months === 12 ? "1Y" : "All",
    /** For screen readers, after the label. */
    long: n < months || months === 12 ? `last ${n} months` : `all ${n} months`,
  }));
}

/** The change from the first to the last value in percent, or null when it cannot be told. */
export function changePct(history: MrrPoint[]) {
  const [first, last] = [history[0], history.at(-1)];
  if (!first || !last || history.length < 2 || first.cents <= 0) return null;
  return ((last.cents - first.cents) / first.cents) * 100;
}

/**
 * Polyline points for a sparkline in a `width` × `height` box. The vertical range runs from the
 * lowest value to the highest, but always spans at least 30% of the highest, so the shape of real
 * growth shows while small wobbles stay small.
 */
export function sparklinePoints(history: MrrPoint[], width: number, height: number, inset = 0) {
  const values = history.map((p) => p.cents);
  const max = Math.max(...values);
  const low = Math.max(0, Math.min(Math.min(...values), max * 0.7));
  const last = history.length - 1;
  return history.map((p, i) => ({
    x: inset + (last === 0 ? 1 : i / last) * (width - 2 * inset),
    y: inset + (max > low ? 1 - (p.cents - low) / (max - low) : 1) * (height - 2 * inset),
  }));
}
