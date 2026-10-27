// Revenue from Superwall's daily Proceeds chart. Pure functions: no I/O, fully testable.
// A key limited to charts sees no transactions, so each day of the chart counts as one payment of
// the app: its proceeds in USD, which Superwall gives after refunds, taxes and the app stores'
// fees. That is less than what customers paid, as the stores keep their fees before paying out;
// no chart Superwall documents gives revenue after refunds without taking the fees off as well.
// Subscriptions and one-time purchases are mixed, so the kind is unknown. A day's figure changes
// as refunds come in, so the figure is its fingerprint.
import { toMinorUnits } from "../money";
import { dayOf } from "../payments";
import type { ListedPayment } from "../types";
import { CHART_CURRENCY, type ChartPoint } from "./mrr";

export function chartPayments(
  application: string,
  points: ChartPoint[],
  since: number,
  before: number | null,
): ListedPayment[] {
  return points.flatMap((point) => {
    if (point.at < since || (before !== null && point.at >= before) || point.value === 0) return [];
    return [
      {
        id: `${application}:${dayOf(point.at)}`,
        at: point.at,
        fingerprint: String(point.value),
        value: { currency: CHART_CURRENCY, amount: toMinorUnits(point.value, CHART_CURRENCY) },
        kind: "unknown",
      },
    ];
  });
}
