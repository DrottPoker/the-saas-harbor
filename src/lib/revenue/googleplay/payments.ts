// Revenue from Play Console's estimated sales reports. Pure functions: no I/O, fully testable.
// Every charge counts, subscriptions and one-time products and paid apps alike, at its item price,
// which is without the tax Google collects, less what its refunds took back where the rows read
// include them; refunds are added to the report of the month they are made in. The reports do not
// take off chargebacks. Charges are summed per UTC day, kind and currency, and each sum counts as
// one payment, so the number of payments stored stays small however many orders an app has; a
// day's sum changes as late charges and refunds come in, so the figures are its fingerprint.
import { dayOf, dayStart } from "../payments";
import type { ListedPayment, PaymentKind } from "../types";
import type { SaleCharge } from "./mrr";

export function googlePlayPayments(
  charges: SaleCharge[],
  since: number,
  before: number | null,
): ListedPayment[] {
  const days = new Map<
    string,
    {
      day: string;
      kind: PaymentKind;
      currency: string;
      gross: number;
      refunded: number;
      count: number;
    }
  >();
  for (const charge of charges) {
    if (charge.at < since || (before !== null && charge.at >= before)) continue;
    const kind: PaymentKind = charge.subscription ? "subscription" : "one_time";
    const day = dayOf(charge.at);
    const id = `${day}:${kind}:${charge.currency}`;
    const total = days.get(id) ?? {
      day,
      kind,
      currency: charge.currency,
      gross: 0,
      refunded: 0,
      count: 0,
    };
    total.gross += charge.amount;
    total.refunded += charge.refunded;
    total.count++;
    days.set(id, total);
  }
  return [...days].map(([id, total]) => ({
    id,
    at: dayStart(total.day),
    fingerprint: `${Math.round(total.gross)}:${Math.round(total.refunded)}:${total.count}`,
    value: { currency: total.currency, amount: Math.max(0, total.gross - total.refunded) },
    kind: total.kind,
  }));
}
