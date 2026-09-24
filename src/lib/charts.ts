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
  // At least $4, so every step is a whole number of dollars or more.
  const max = maxCents > 0 ? Math.max(maxCents, 400) : 10_000;
  const magnitude = 10 ** Math.floor(Math.log10(max / intervals));
  const [step, steps] = [1, 2, 2.5, 5, 10]
    .map((f) => [f * magnitude, Math.ceil(max / (f * magnitude) - 1e-9)] as const)
    .filter(([, n]) => n >= intervals - 1 && n <= intervals + 1)
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
  points: ChartPoint[];
  ticks: { y: number; label: string }[];
  summary: string;
};

export function mrrChartModel(history: MrrPoint[]): MrrChartModel {
  const scale = niceScale(Math.max(...history.map((p) => p.cents)));
  const last = history.length - 1;
  const months = history.map((p) => p.month);
  const wide = axisLabels(months, () => true);
  const narrow = axisLabels(months, (i) => (last - i) % 2 === 0);
  const points = history.map((p, i) => ({
    month: p.month,
    label: monthLabel(p.month),
    axisLabel: wide[i]!,
    narrowLabel: narrow[i],
    value: wholeUsd(p.cents),
    x: last === 0 ? 1 : i / last,
    y: 1 - p.cents / scale.max,
  }));
  const [first, end] = [points[0], points[last]];
  return {
    points,
    ticks: scale.ticks.map((cents) => ({ y: 1 - cents / scale.max, label: compactUsd(cents) })),
    summary:
      last === 0
        ? `MRR was ${end.value} at the end of ${end.label}.`
        : `MRR at month end went from ${first.value} in ${first.label} to ${end.value} in ${end.label}.`,
  };
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
