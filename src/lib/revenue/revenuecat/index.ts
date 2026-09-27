import "server-only";
import { splitAccountKey } from "../account-key";
import { VerificationError } from "../errors";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { canRead, fetchChart, fetchChartOptions, otherAccessPaths } from "./client";
import { parseRevenueCatKey } from "./key";
import { dayOf, dayStart } from "../payments";
import { chartPayments } from "./payments";
import {
  chartCurrency,
  chartPoints,
  dailyResolution,
  latestValue,
  revenueCatMrr,
  revenueCatServiceLines,
  untaxedSelectors,
} from "./mrr";

const DAY_MS = 86_400_000;
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** RevenueCat has no revenue from before it existed, so the charts are read from here on. */
const FIRST_CHART_DAY = "2018-01-01";
/** The days one chart request covers, reading the revenue chart back in time. */
const CHART_DAYS = 366;

/**
 * Refuses a key that reaches anything beyond charts, every time it is used. RevenueCat cannot
 * say whether such access only reads, and verification needs none of it.
 */
async function requireChartsOnly(key: string, project: string) {
  for (const path of otherAccessPaths(project))
    if (await canRead(key, path))
      throw new VerificationError(
        "The key has more access than charts. Create a V2 secret API key with read access to Charts & metrics only.",
      );
}

/** A daily chart between two instants, with the options it needs. */
async function dailyChart(key: string, project: string, chart: string, from: number, to: number) {
  const options = await fetchChartOptions(key, project, chart);
  const resolution = dailyResolution(options);
  if (!resolution)
    throw new ProviderRequestError(`RevenueCat does not offer the ${chart} chart by day.`);
  return fetchChart(key, project, chart, {
    resolution,
    start: date(from),
    end: date(to),
    selectors: untaxedSelectors(options),
  });
}

/**
 * RevenueCat: MRR and active subscriptions from its daily charts, with the MRR chart's last
 * thirteen months as the history, and revenue from the daily revenue chart. One project verifies
 * one product.
 */
export const revenuecat: ProviderAdapter = {
  id: "revenuecat",
  parseKey: (input) => parseRevenueCatKey(input),
  async read(stored, _livemode, { now, history }) {
    const { account: project, key } = splitAccountKey(stored);
    await requireChartsOnly(key, project);
    const today = now.getTime();
    // The first day of the month thirteen months back covers twelve month-ends and 30 days.
    const from = history
      ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1)
      : today - 3 * DAY_MS;
    const mrrChart = await dailyChart(key, project, "mrr", from, today);
    const activesChart = await dailyChart(key, project, "actives", today - 3 * DAY_MS, today);
    const points = chartPoints(mrrChart, /mrr/i);
    const currency = chartCurrency(mrrChart);
    const byCurrency = revenueCatMrr(points, currency);
    return {
      livemode: true,
      byCurrency,
      customers: Object.keys(byCurrency).length
        ? Math.round(latestValue(chartPoints(activesChart, /activ/i)))
        : 0,
      subscriptionIds: [`project:${project}`],
      skippedItems: 0,
      lines: history ? revenueCatServiceLines(points, currency, now) : null,
      historyNote: null,
    };
  },
  async payments(stored, _livemode, { since, before, maxPages }) {
    const { account: project, key } = splitAccountKey(stored);
    await requireChartsOnly(key, project);
    const options = await fetchChartOptions(key, project, "revenue");
    const resolution = dailyResolution(options);
    if (!resolution)
      throw new ProviderRequestError("RevenueCat does not offer the revenue chart by day.");
    const first = Math.max(since, dayStart(FIRST_CHART_DAY));
    let end = before ?? Math.floor(Date.now() / 1000);
    const payments = [];
    for (let requests = 0; end > first; requests++) {
      if (requests >= maxPages) return { payments, complete: false, from: end };
      const start = Math.max(first, end - CHART_DAYS * 86_400);
      const chart = await fetchChart(key, project, "revenue", {
        resolution,
        start: dayOf(start),
        end: dayOf(end - 1),
        selectors: untaxedSelectors(options),
      });
      payments.push(
        ...chartPayments(project, chartPoints(chart, /revenue/i), chartCurrency(chart), start, end),
      );
      end = start;
    }
    return { payments, complete: true };
  },
};
