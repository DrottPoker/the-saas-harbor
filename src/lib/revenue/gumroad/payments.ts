// Revenue from Gumroad's sales summary. Pure functions: no I/O, fully testable.
// The summary gives each day's sales, one-time purchases and memberships alike, in US cents after
// discounts and without the tax Gumroad collects, less what was refunded of them. Its days follow
// the seller's time zone. A token that can only view sales can read it, but not refunds or
// disputes on their own, so each day counts as one payment of the account, of unknown kind, and
// its figure is its fingerprint, since refunds change it later.
import { dayStart } from "../payments";
import type { ListedPayment } from "../types";

export type GumroadSummaryDay = { key: string; net_cents: number };

export function summaryPayments(
  account: string,
  days: GumroadSummaryDay[],
  since: number,
  before: number | null,
): ListedPayment[] {
  return days.flatMap((day) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.key)) return [];
    const at = dayStart(day.key);
    if (at < since || (before !== null && at >= before) || !day.net_cents) return [];
    return [
      {
        id: `${account}:${day.key}`,
        at,
        fingerprint: String(day.net_cents),
        value: { currency: "usd", amount: day.net_cents },
        kind: "unknown",
      },
    ];
  });
}
