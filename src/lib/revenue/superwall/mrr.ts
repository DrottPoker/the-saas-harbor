// Monthly recurring revenue from Superwall. Pure functions: no I/O, fully testable.
// A key that reads charts only sees no subscriptions or prices, so MRR comes from Superwall's own
// MRR chart, by day, for production purchases: its subscription revenue normalized to a month, in
// USD, as Superwall reports every amount. Superwall documents no more than that: whether the chart
// counts store fees, tax, trials, introductory prices or subscriptions in billing retry is not
// said, so it is taken as Superwall shows it in its dashboard. Subscribers come from its Active
// Subscriptions chart, which counts unexpired paid subscriptions rather than customers. The daily
// values give the history as well.
import type { ServiceLine } from "../history";
import { toMinorUnits } from "../money";

/** A chart as `GET /v2/charts/definitions` lists it, with the axes and date it asks for. */
export type ChartType = {
  key: string;
  name: string;
  x_axis: string;
  y_axis: string;
  date_dimension: string;
};
export type ChartDefinitions = { chart_types?: ChartType[] | null };

/** Chart data: one row a day, with a value per series, in major units for amounts. */
export type ChartData = {
  data?:
    | {
        x: string;
        incomplete?: boolean | null;
        values?: Record<string, { y?: number | null } | null> | null;
      }[]
    | null;
  y_axis?: { key?: string | null; value_type?: string | null } | null;
};
export type ChartPoint = { at: number; value: number; incomplete: boolean };

/** Superwall's charts are in US dollars. */
export const CHART_CURRENCY = "usd";

// The charts by their names in the dashboard, or by key where the name differs.
const CHARTS = {
  mrr: { name: /^mrr$/i, key: /^mrr$/i },
  actives: { name: /^active subscriptions$/i, key: /^activeSubscriptions?$/i },
  proceeds: { name: /^proceeds$/i, key: /^(net)?proceeds$/i },
};

/** The axes and date of a chart, or null where Superwall does not offer it. */
export function findChart(definitions: ChartDefinitions, chart: keyof typeof CHARTS) {
  const { name, key } = CHARTS[chart];
  const types = definitions.chart_types ?? [];
  return types.find((t) => name.test(t.name.trim())) ?? types.find((t) => key.test(t.key)) ?? null;
}

/**
 * The request for a chart's daily values between two dates (YYYY-MM-DD), for production
 * purchases only, without a breakdown.
 */
export function chartQuery(application: string, chart: ChartType, from: string, to: string) {
  return {
    application_id: application,
    y_axis: chart.y_axis,
    x_axis: chart.x_axis,
    breakdown: null,
    date_filter: { dimension: chart.date_dimension, preset: "custom", range: { from, to } },
    date_interval: "day",
    environment: ["PRODUCTION"],
    max_data_points: 1000,
  };
}

/** Unix seconds from a chart's x value, a date or a time. */
function unix(x: string) {
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(x) ? `${x}T00:00:00Z` : x);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/**
 * A row's value. Without a breakdown there is one series; should there be several, a total
 * series is taken, or else their sum.
 */
function rowValue(values: Record<string, { y?: number | null } | null> | null | undefined) {
  const entries = Object.entries(values ?? {}).flatMap(([key, value]) =>
    typeof value?.y === "number" && Number.isFinite(value.y) ? [[key, value.y] as const] : [],
  );
  if (!entries.length) return null;
  if (entries.length === 1) return entries[0][1];
  const total = entries.find(([key]) => /^(total|all|null)?$/i.test(key));
  return total ? total[1] : entries.reduce((sum, [, y]) => sum + y, 0);
}

/** The chart's points, oldest first. */
export function chartPoints(data: ChartData): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const row of data.data ?? []) {
    const at = unix(row.x);
    const value = rowValue(row.values);
    if (at !== null && value !== null) points.push({ at, value, incomplete: !!row.incomplete });
  }
  return points.sort((a, b) => a.at - b.at);
}

/** The latest value of a day Superwall has finished counting, or the latest at all. */
export function latestValue(points: ChartPoint[]) {
  return (points.findLast((point) => !point.incomplete) ?? points.at(-1))?.value ?? 0;
}

/** MRR in minor units from the MRR chart. */
export function superwallMrr(points: ChartPoint[]): Record<string, number> {
  const mrr = toMinorUnits(latestValue(points), CHART_CURRENCY);
  return mrr > 0 ? { [CHART_CURRENCY]: mrr } : {};
}

const DAY = 86_400;

/**
 * Service lines from the daily MRR chart: each day's value from its point until the next, the
 * last until a day after `now`, so the MRR at any instant is that day's value.
 */
export function superwallServiceLines(points: ChartPoint[], now: Date): ServiceLine[] {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return points.map((point, i) => ({
    start: point.at,
    end: points[i + 1]?.at ?? Math.max(point.at + DAY, nowSeconds + DAY),
    currency: CHART_CURRENCY,
    monthly: toMinorUnits(point.value, CHART_CURRENCY),
  }));
}
