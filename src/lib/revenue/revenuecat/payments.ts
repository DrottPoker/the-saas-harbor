// Revenue from RevenueCat's daily revenue chart. Pure functions: no I/O, fully testable.
// A key limited to charts sees no transactions, so each day of the revenue chart counts as one
// payment: its revenue before tax where the chart offers that, with refunds taken off, and
// subscriptions and one-time purchases alike, so its kind is unknown. A day's figure can change as
// refunds come in, so the figure is its fingerprint.
import { toMinorUnits } from "../money";
import { dayOf } from "../payments";
import type { ListedPayment } from "../types";
import type { ChartPoint } from "./mrr";

export function chartPayments(
  project: string,
  points: ChartPoint[],
  currency: string,
  since: number,
  before: number | null,
): ListedPayment[] {
  return points.flatMap((point) => {
    if (point.at < since || (before !== null && point.at >= before) || point.value === 0) return [];
    return [
      {
        id: `${project}:${dayOf(point.at)}`,
        at: point.at,
        fingerprint: String(point.value),
        value: { currency, amount: toMinorUnits(point.value, currency) },
        kind: "unknown",
      },
    ];
  });
}
