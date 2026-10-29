import "server-only";
import { splitAccountKey } from "../account-key";
import { revenueText, VerificationError } from "../errors";
import { ProviderRequestError } from "../http";
import { dayOf, dayStart } from "../payments";
import type { ProviderAdapter } from "../types";
import { canRead, fetchChart, fetchDefinitions, otherAccess } from "./client";
import { parseSuperwallKey } from "./key";
import {
  chartPoints,
  chartQuery,
  findChart,
  latestValue,
  superwallMrr,
  superwallServiceLines,
  type ChartDefinitions,
  type ChartType,
} from "./mrr";
import { chartPayments } from "./payments";

const DAY = 86_400;
/** Superwall has no revenue from before it tracked it, so the Proceeds chart is read from here. */
const FIRST_CHART_DAY = "2021-01-01";
/** The days one chart request covers, reading the Proceeds chart back in time. */
const CHART_DAYS = 366;

/**
 * Refuses a key that reaches anything beyond charts, every time it is used. A key with charts:read
 * alone cannot list the organization's API keys, so it cannot see its own scopes, and nothing
 * shows whether it can write; a key with more scopes than charts:read is refused when it can read
 * projects, paywalls or campaigns, as a key with every scope can.
 */
async function requireChartsOnly(key: string, application: string) {
  for (const endpoint of otherAccess(application))
    if (await canRead(key, endpoint)) throw new VerificationError("superwall.beyondCharts");
}

function chartOf(definitions: ChartDefinitions, chart: "mrr" | "proceeds", name: string) {
  const found = findChart(definitions, chart);
  if (!found) throw new ProviderRequestError("superwall.noChart", { chart: name });
  return found;
}

/** A chart's daily points between two instants, checking that it gives what it should. */
async function dailyPoints(
  key: string,
  application: string,
  chart: ChartType,
  from: number,
  to: number,
  valueType: "currency" | "number",
) {
  const data = await fetchChart(key, chartQuery(application, chart, dayOf(from), dayOf(to)));
  const given = data.y_axis?.value_type;
  if (given && given !== valueType)
    throw new ProviderRequestError("superwall.wrongFigures", { chart: chart.name });
  return chartPoints(data);
}

/**
 * Superwall: MRR from its daily MRR chart, with the last thirteen months as the history,
 * subscribers from its Active Subscriptions chart, and revenue from its daily Proceeds chart. One
 * app verifies one product.
 */
export const superwall: ProviderAdapter = {
  id: "superwall",
  parseKey: (input) => parseSuperwallKey(input),
  async read(stored, _livemode, { now, history }) {
    const { account: application, key } = splitAccountKey(stored);
    const definitions = await fetchDefinitions(key, application);
    await requireChartsOnly(key, application);
    const mrrChart = chartOf(definitions, "mrr", "MRR");
    const activesChart = findChart(definitions, "actives");
    const today = Math.floor(now.getTime() / 1000);
    // The first day of the month thirteen months back covers twelve month-ends and 30 days.
    const from = history
      ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1) / 1000
      : today - 3 * DAY;
    const points = await dailyPoints(key, application, mrrChart, from, today, "currency");
    const byCurrency = superwallMrr(points);
    let customers = 0;
    if (activesChart && Object.keys(byCurrency).length)
      customers = Math.round(
        latestValue(
          await dailyPoints(key, application, activesChart, today - 3 * DAY, today, "number"),
        ),
      );
    return {
      livemode: true,
      byCurrency,
      customers,
      subscriptionIds: [`application:${application}`],
      skippedItems: 0,
      mrrNote: activesChart ? null : revenueText("superwall.noActives"),
      lines: history ? superwallServiceLines(points, now) : null,
      historyNote: null,
    };
  },
  async payments(stored, _livemode, { since, before, maxPages }) {
    const { account: application, key } = splitAccountKey(stored);
    const definitions = await fetchDefinitions(key, application);
    await requireChartsOnly(key, application);
    const chart = chartOf(definitions, "proceeds", "Proceeds");
    const first = Math.max(since, dayStart(FIRST_CHART_DAY));
    let end = before ?? Math.floor(Date.now() / 1000);
    const payments = [];
    for (let requests = 0; end > first; requests++) {
      if (requests >= maxPages) return { payments, complete: false, from: end };
      const start = Math.max(first, end - CHART_DAYS * DAY);
      const points = await dailyPoints(key, application, chart, start, end - 1, "currency");
      payments.push(...chartPayments(application, points, start, end));
      end = start;
    }
    return { payments, complete: true };
  },
};
