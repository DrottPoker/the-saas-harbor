// Monthly recurring revenue from RevenueCat. Pure functions: no I/O, fully testable.
// RevenueCat does not give subscriptions with their prices through a key that reads charts only,
// so MRR comes from its own daily MRR chart, before tax where the chart offers that: its active
// paid subscriptions normalized to a month. Unlike the other providers, it counts introductory
// and promotional prices as charged, leaves out subscriptions in billing retry, and counts
// subscriptions rather than customers. The daily values give the history as well.
import type { ServiceLine } from "../history";
import { toMinorUnits } from "../money";

/**
 * A chart as RevenueCat returns it. Values are rows of a time and one value per measure, or
 * objects that name their measure, in major units of `yaxis_currency`.
 */
export type ChartData = {
  values: unknown[];
  measures?: { display_name?: string | null }[] | null;
  yaxis_currency?: string | null;
};
export type ChartOptions = {
  resolutions?: { id: string; display_name: string }[] | null;
  user_selectors?: Record<string, { options?: { id: string }[] | null }> | null;
};
export type ChartPoint = { at: number; value: number };

const DAY = 86_400;

/** The id of the chart's daily resolution. */
export function dailyResolution(options: ChartOptions) {
  const day = (options.resolutions ?? []).find(
    (r) => r.display_name.toLowerCase() === "day" || r.id === "day",
  );
  return day?.id ?? null;
}

/** Chart selectors that ask for revenue without tax, where the chart offers that. */
export function untaxedSelectors(options: ChartOptions) {
  for (const [name, selector] of Object.entries(options.user_selectors ?? {})) {
    const option = selector.options?.find((o) => o.id === "revenue_net_of_taxes");
    if (option) return { [name]: option.id };
  }
  return null;
}

/** Times come in seconds, milliseconds or as dates; this gives seconds. */
function unix(value: unknown) {
  if (typeof value === "string" && !/^\d+$/.test(value)) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) return null;
  return number > 1e11 ? Math.floor(number / 1000) : number;
}

/** The points of the measure whose name matches `measure`, or the first, oldest first. */
export function chartPoints(data: ChartData, measure: RegExp): ChartPoint[] {
  const names = (data.measures ?? []).map((m) => m.display_name ?? "");
  const index = Math.max(
    0,
    names.findIndex((name) => measure.test(name)),
  );
  const points: ChartPoint[] = [];
  for (const row of data.values) {
    let at: number | null = null;
    let value: number | null = null;
    if (Array.isArray(row)) {
      at = unix(row[0]);
      value = Number(row[index + 1]);
    } else if (row && typeof row === "object") {
      const item = row as { cohort?: unknown; date?: unknown; measure?: unknown; value?: unknown };
      if ((Number(item.measure) || 0) !== index) continue;
      at = unix(item.cohort ?? item.date);
      value = Number(item.value);
    }
    if (at !== null && value !== null && Number.isFinite(value)) points.push({ at, value });
  }
  return points.sort((a, b) => a.at - b.at);
}

/** The latest value of a chart, or zero without any. */
export function latestValue(points: ChartPoint[]) {
  return points.at(-1)?.value ?? 0;
}

/** The currency of a chart's amounts: the one asked for, as RevenueCat confirms it. */
export function chartCurrency(data: ChartData) {
  return (data.yaxis_currency || "USD").toLowerCase();
}

/** MRR per currency, in minor units, from the latest point of the MRR chart. */
export function revenueCatMrr(points: ChartPoint[], currency: string): Record<string, number> {
  const mrr = toMinorUnits(latestValue(points), currency);
  return mrr > 0 ? { [currency]: mrr } : {};
}

/**
 * Service lines from the daily MRR chart: each day's value from its point until the next, the
 * last until a day after `now`, so the MRR at any instant is that day's value.
 */
export function revenueCatServiceLines(
  points: ChartPoint[],
  currency: string,
  now: Date,
): ServiceLine[] {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return points.map((point, i) => ({
    start: point.at,
    end: points[i + 1]?.at ?? Math.max(point.at + DAY, nowSeconds + DAY),
    currency,
    monthly: toMinorUnits(point.value, currency),
  }));
}
