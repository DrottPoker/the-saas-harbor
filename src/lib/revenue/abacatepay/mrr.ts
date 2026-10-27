// Monthly recurring revenue from AbacatePay's Public MRR routes. Pure functions: no I/O, fully
// testable. The Trust MRR token cannot list subscriptions, so MRR is AbacatePay's own figure: each
// paying subscription's value for one month (a yearly plan counts a twelfth, a quarterly one a
// third), in centavos. Subscribers are AbacatePay's active subscriptions, which include those in a
// trial, so they count subscriptions rather than customers. The MRR at the end of each day, in
// Brasília time, gives the history. AbacatePay does not say whether its figures include tax, so
// they count as charged.
import type { ServiceLine } from "../history";
import { dayStart } from "../payments";

/** An amount with its currency, as AbacatePay gives MRR and the subscription count. */
export type AbacateAmount = { currency?: string | null; value?: number | null };

/** The answer of /public-mrr/mrr: MRR in minor units, and active subscriptions as a count. */
export type AbacateMrr = {
  mrr?: AbacateAmount | null;
  totalActiveSubscriptions?: AbacateAmount | null;
};

/** The answer of /public-mrr/mrr-by-day: the MRR in minor units at the end of each day. */
export type AbacateMrrByDay = Record<string, { mrr?: number | null } | null>;

export type MrrPoint = { at: number; value: number };

const DAY = 86_400;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** AbacatePay's currency, lowercase. It sells in reais only. */
export function abacateCurrency(amount: AbacateAmount | null | undefined) {
  return (amount?.currency || "BRL").toLowerCase();
}

/** MRR per currency, in minor units: AbacatePay gives centavos, the minor unit of the real. */
export function abacateMrr(data: AbacateMrr): Record<string, number> {
  const value = Number(data.mrr?.value);
  return Number.isFinite(value) && value > 0 ? { [abacateCurrency(data.mrr)]: value } : {};
}

/** Active subscriptions, trials included, or none without MRR. */
export function abacateSubscribers(data: AbacateMrr) {
  if (!Object.keys(abacateMrr(data)).length) return 0;
  const count = Number(data.totalActiveSubscriptions?.value);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
}

/** The points of the daily MRR, oldest first, each dated at the start of its day. */
export function mrrPoints(days: AbacateMrrByDay): MrrPoint[] {
  const points: MrrPoint[] = [];
  for (const [day, entry] of Object.entries(days)) {
    const value = Number(entry?.mrr);
    if (DAY_KEY.test(day) && Number.isFinite(value)) points.push({ at: dayStart(day), value });
  }
  return points.sort((a, b) => a.at - b.at);
}

/**
 * Service lines from the daily MRR: each day's value from its start until the next point, the
 * last until a day after `now`, so the MRR at any instant is that day's closing value.
 */
export function abacateServiceLines(
  points: MrrPoint[],
  currency: string,
  now: Date,
): ServiceLine[] {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return points.map((point, i) => ({
    start: point.at,
    end: points[i + 1]?.at ?? Math.max(point.at + DAY, nowSeconds + DAY),
    currency,
    monthly: point.value,
  }));
}
