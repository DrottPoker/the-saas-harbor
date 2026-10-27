import "server-only";
import { dayOf, dayStart } from "../payments";
import { unixSeconds } from "../history";
import type { ListedPayment, ProviderAdapter } from "../types";
import {
  fetchMerchant,
  fetchMrr,
  fetchMrrByDay,
  fetchRevenue,
  type AbacateMerchant,
} from "./client";
import { parseAbacatePayKey } from "./key";
import {
  abacateCurrency,
  abacateMrr,
  abacateServiceLines,
  abacateSubscribers,
  mrrPoints,
  type AbacateMrrByDay,
} from "./mrr";
import { revenuePayments } from "./payments";

const DAY = 86_400;
/** The days one request covers: AbacatePay's limit for the daily MRR, kept for revenue too. */
const RANGE_DAYS = 366;
/** AbacatePay sells in reais only, and its revenue route names no currency. */
const CURRENCY = "brl";

/**
 * The first day the store can have figures for: the day before the UTC day it was created, since
 * AbacatePay's days follow Brasília time. Zero when AbacatePay does not say.
 */
function storeStart(merchant: AbacateMerchant) {
  const created = unixSeconds(merchant.createdAt);
  return created === null ? 0 : dayStart(dayOf(created)) - DAY;
}

/** The daily MRR from `from` to today, a year per request. */
async function dailyMrr(token: string, from: number, now: number) {
  const today = dayStart(dayOf(now));
  const days: AbacateMrrByDay = {};
  for (let start = dayStart(dayOf(from)); start <= today; start += RANGE_DAYS * DAY) {
    const end = Math.min(today, start + (RANGE_DAYS - 1) * DAY);
    Object.assign(days, await fetchMrrByDay(token, dayOf(start), dayOf(end)));
  }
  return mrrPoints(days);
}

/**
 * AbacatePay, through the token of its Trust MRR app: MRR and active subscriptions as AbacatePay
 * counts them, the daily MRR of the last thirteen months as the history, and revenue from its
 * daily totals. The token belongs to one store, which verifies one product.
 */
export const abacatepay: ProviderAdapter = {
  id: "abacatepay",
  parseKey: ({ key }) => parseAbacatePayKey(key),
  async read(token, _livemode, { now, history }) {
    const merchant = await fetchMerchant(token);
    const mrr = await fetchMrr(token);
    let lines = null;
    if (history) {
      // The first day of the month thirteen months back covers twelve month-ends and 30 days.
      const from = Math.max(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1) / 1000,
        storeStart(merchant),
      );
      const points = await dailyMrr(token, from, Math.floor(now.getTime() / 1000));
      lines = abacateServiceLines(points, abacateCurrency(mrr.mrr), now);
    }
    return {
      // AbacatePay cannot say whether a token was made in test mode.
      livemode: true,
      byCurrency: abacateMrr(mrr),
      customers: abacateSubscribers(mrr),
      subscriptionIds: [`merchant:${merchant.id}`],
      skippedItems: 0,
      lines,
      historyNote: null,
    };
  },
  // Revenue is read a year per request, newest first, back to the day the store was created.
  async payments(token, _livemode, { since, before, maxPages }) {
    const merchant = await fetchMerchant(token);
    const first = Math.max(since, storeStart(merchant));
    let end = before ?? dayStart(dayOf(Date.now() / 1000)) + DAY;
    const payments: ListedPayment[] = [];
    for (let requests = 0; end > first; requests++) {
      if (requests >= maxPages) return { payments, complete: false, from: end };
      const start = Math.max(first, end - RANGE_DAYS * DAY);
      // The end date must come after the start date, so a single day is asked for with the day
      // before it, which the window then leaves out.
      const revenue = await fetchRevenue(
        token,
        dayOf(Math.min(start, end - 2 * DAY)),
        dayOf(end - DAY),
      );
      payments.push(...revenuePayments(merchant.id, revenue, CURRENCY, start, end));
      end = start;
    }
    return { payments, complete: true };
  },
};
