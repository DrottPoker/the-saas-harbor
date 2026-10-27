// Revenue from AbacatePay's revenue by day. Pure functions: no I/O, fully testable.
// The Trust MRR token sees no transactions, only each day's total of them in centavos, with days
// in Brasília time. Each day counts as one payment of the store, subscriptions and one-time
// purchases alike, so its kind is unknown. AbacatePay does not say whether the totals take off
// refunds or include tax, so they count as given, and a day's figure is its fingerprint, since it
// would change if refunds came off later.
import { dayStart } from "../payments";
import type { ListedPayment } from "../types";

/** The answer of /public-mrr/revenue. */
export type AbacateRevenue = {
  totalRevenue?: number | null;
  totalTransactions?: number | null;
  transactionsPerDay?: Record<string, { amount?: number | null; count?: number | null } | null>;
};

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function revenuePayments(
  store: string,
  revenue: AbacateRevenue,
  currency: string,
  since: number,
  before: number | null,
): ListedPayment[] {
  return Object.entries(revenue.transactionsPerDay ?? {}).flatMap(([day, entry]) => {
    const amount = Number(entry?.amount);
    if (!DAY_KEY.test(day) || !Number.isFinite(amount) || amount === 0) return [];
    const at = dayStart(day);
    if (at < since || (before !== null && at >= before)) return [];
    return [
      {
        id: `${store}:${day}`,
        at,
        fingerprint: String(amount),
        value: { currency, amount },
        kind: "unknown",
      },
    ];
  });
}
