// Chart models for revenue history. Pure and deterministic: labels are computed here, on the
// server, so client charts only position marks and never format numbers themselves. The series
// stay in USD cents; amounts are written in the visitor's money and months in its language.
import { createTranslator } from "next-intl";
import { z } from "zod";
import english from "@/messages/en/charts.json";
import { formatMoney, usdMoney, type Money } from "./display-money";

/** The keys of the charts namespace this module writes with. */
type ChartKey =
  | "axisWithYear"
  | "summary.mrr"
  | "summary.mrrOne"
  | "summary.revenue"
  | "summary.revenueOne"
  | "periods.months"
  | "periods.year"
  | "periods.all"
  | "periods.last"
  | "periods.whole";

/** Words from the charts namespace, such as `await getTranslations("charts")`. */
export type ChartWords = (key: ChartKey, values?: Record<string, string | number>) => string;

/** How a chart writes its labels: amounts in `money`, whose locale also names the months. */
export type ChartFormat = { money: Money; t: ChartWords };

/** US dollars and English, as the Markdown versions and the tests read charts. */
export const ENGLISH_CHART: ChartFormat = {
  money: usdMoney(),
  t: createTranslator({
    locale: "en",
    messages: { charts: english },
    namespace: "charts",
    timeZone: "UTC",
  }),
};

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

const monthFormats = new Map<string, Intl.DateTimeFormat>();

/** A YYYY-MM month written by `Intl` in a language. */
function formatMonth(month: string, locale: string, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = monthFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    monthFormats.set(key, format);
  }
  const [year, index] = month.split("-").map(Number);
  return format.format(new Date(Date.UTC(year!, index! - 1, 1)));
}

/** A month and its year as a sentence names them: "January 2026", "enero de 2026". */
export function monthLabel(month: string, locale = "en-US") {
  return formatMonth(month, locale, { month: "long", year: "numeric" });
}

/** A month standing alone, as a table row or a tooltip names it: "Enero de 2026" in Spanish. */
function monthHeading(month: string, locale: string) {
  const label = monthLabel(month, locale);
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

/**
 * Short month labels for the months an axis shows (null for the rest). A label carries the year
 * when it is the first one shown or the year changed since the previous one shown.
 */
function axisLabels(months: string[], shown: (index: number) => boolean, format: ChartFormat) {
  let previousYear: string | null = null;
  return months.map((month, i) => {
    if (!shown(i)) return null;
    const year = month.slice(2, 4);
    const name = formatMonth(month, format.money.locale, { month: "short" });
    const withYear = year !== previousYear;
    previousYear = year;
    return withYear ? format.t("axisWithYear", { month: name, year }) : name;
  });
}

// Whole dollars: a reconstructed, currency-converted history is not accurate to the cent.
export function wholeUsd(cents: number) {
  return formatMoney(cents, usdMoney(), "whole");
}

export function compactUsd(cents: number) {
  return formatMoney(cents, usdMoney(), "compact");
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

/**
 * The axis of a series in the visitor's currency: round steps of that currency, so a converted
 * axis reads €0, €2.5K, €5K rather than the converted dollar steps. `y` turns USD cents into a
 * position from the top.
 */
function moneyAxis(values: number[], money: Money) {
  const scale = niceScale(Math.max(...values) * money.rate);
  return {
    y: (cents: number) => (cents * money.rate) / scale.max,
    ticks: scale.ticks.map((tick) => ({
      y: 1 - tick / scale.max,
      label: formatMoney(tick / money.rate, money, "compact"),
    })),
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
function monthAxis(months: string[], format: ChartFormat) {
  const last = months.length - 1;
  const step = months.length > 6 ? 3 : 2;
  const wide = axisLabels(months, () => true, format);
  const narrow = axisLabels(months, (i) => (last - i) % step === 0, format);
  return months.map((month, i) => ({
    month,
    label: monthHeading(month, format.money.locale),
    axisLabel: wide[i]!,
    narrowLabel: narrow[i],
  }));
}

export function mrrChartModel(
  history: MrrPoint[],
  format: ChartFormat = ENGLISH_CHART,
): MrrChartModel {
  const { money, t } = format;
  const axis = moneyAxis(
    history.map((p) => p.cents),
    money,
  );
  const last = history.length - 1;
  const months = monthAxis(
    history.map((p) => p.month),
    format,
  );
  const points = history.map((p, i) => ({
    ...months[i]!,
    value: formatMoney(p.cents, money, "whole"),
    x: last === 0 ? 1 : i / last,
    y: 1 - axis.y(p.cents),
  }));
  const [first, end] = [points[0]!, points[last]!];
  const month = (point: ChartPoint) => monthLabel(point.month, money.locale);
  return {
    kind: "line",
    points,
    ticks: axis.ticks,
    summary:
      last === 0
        ? t("summary.mrrOne", { value: end.value, month: month(end) })
        : t("summary.mrr", {
            first: first.value,
            firstMonth: month(first),
            end: end.value,
            endMonth: month(end),
          }),
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
export function revenueChartModel(
  history: RevenuePoint[],
  format: ChartFormat = ENGLISH_CHART,
): RevenueChartModel {
  const { money, t } = format;
  const whole = (amount: number) => formatMoney(amount, money, "whole");
  const axis = moneyAxis(
    history.map((p) => p.cents),
    money,
  );
  const months = monthAxis(
    history.map((p) => p.month),
    format,
  );
  const split = history.every((p) => p.split);
  const sum = (part: (p: RevenuePoint) => number) => history.reduce((s, p) => s + part(p), 0);
  const part = (amount: number, total: number) => ({
    value: whole(amount),
    share: total > 0 ? amount / total : 0,
  });
  const bars = history.map((p, i) => ({
    ...months[i]!,
    value: whole(p.cents),
    x: (i + 0.5) / history.length,
    height: axis.y(p.cents),
    parts:
      split && p.split
        ? {
            subscription: part(p.split.subscription, p.cents),
            oneTime: part(p.split.oneTime, p.cents),
          }
        : null,
  }));
  const total = whole(sum((p) => p.cents));
  const [first, end] = [bars[0]!, bars.at(-1)!];
  const month = (bar: RevenueBar) => monthLabel(bar.month, money.locale);
  return {
    kind: "bars",
    bars,
    ticks: axis.ticks,
    summary:
      bars.length === 1
        ? t("summary.revenueOne", { value: end.value, month: month(end) })
        : t("summary.revenue", { firstMonth: month(first), endMonth: month(end), total }),
    total,
    totalParts: split
      ? {
          subscription: whole(sum((p) => p.split!.subscription)),
          oneTime: whole(sum((p) => p.split!.oneTime)),
        }
      : null,
  };
}

/**
 * The periods a revenue chart offers, as month counts: 3, 6 and 12 months where the history is
 * longer, and always the whole history, which is last and chosen first.
 */
export function chartPeriods(months: number, t: ChartWords = ENGLISH_CHART.t) {
  const year = t("periods.year");
  return [...[3, 6, 12].filter((n) => n < months), months].map((n) => ({
    months: n,
    label:
      n < months
        ? n === 12
          ? year
          : t("periods.months", { months: n })
        : months === 12
          ? year
          : t("periods.all"),
    /** For screen readers, after the label. */
    long:
      n < months || months === 12
        ? t("periods.last", { months: n })
        : t("periods.whole", { months: n }),
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
