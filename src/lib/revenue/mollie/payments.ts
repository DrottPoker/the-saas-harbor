// Revenue from Mollie payments. Pure functions: no I/O, fully testable.
// Every paid payment counts, a subscription's or a one-time purchase. It is dated by when it was
// created, the order Mollie lists payments in: most methods are paid within minutes of it, and a
// direct debit within days. It earns its amount without the VAT its lines name, less what was
// refunded and charged back at the same untaxed share; a payment without lines carries no tax, so
// it counts as charged. Refunded and charged-back payments stay paid, with those amounts. A
// payment that a subscription created, or one that sets up or charges a mandate for recurring
// payments, paid for a subscription; a one-off payment was a one-time purchase.
import { unixSeconds } from "../history";
import type { ListedPayment } from "../types";
import { earned, paid, type MolliePayment } from "./mrr";

/** The paid payments of a window: created from `since` (inclusive) to `before` (exclusive). */
export function molliePayments(
  payments: MolliePayment[],
  since: number,
  before: number | null,
): ListedPayment[] {
  const listed = new Map<string, ListedPayment>();
  for (const payment of payments) {
    const at = unixSeconds(payment.createdAt);
    if (at === null || at < since || (before !== null && at >= before) || !paid(payment)) continue;
    const recurring = !!payment.subscriptionId || (payment.sequenceType ?? "oneoff") !== "oneoff";
    listed.set(payment.id, {
      id: payment.id,
      at,
      fingerprint: `${payment.amountRefunded?.value ?? "0"}:${payment.amountChargedBack?.value ?? "0"}`,
      value: { currency: payment.amount.currency.toLowerCase(), amount: earned(payment) },
      kind: recurring ? "subscription" : "one_time",
    });
  }
  return [...listed.values()];
}
