// Revenue from Creem transactions. Pure functions: no I/O, fully testable.
// Every paid transaction counts, a subscription's invoice or a one-time payment. It earns what
// was paid after discounts and without tax, less its refunds at the same untaxed share, since
// Creem's refunded amount includes tax; a transaction charged back earned nothing. An invoice of a
// subscription paid for it; a payment was a one-time purchase.
import { netOf } from "../payments";
import type { ListedPayment } from "../types";
import { unix, untaxedAmount, type CreemTransaction } from "./mrr";

const COUNTED = new Set(["paid", "partialRefund", "refunded", "chargedBack", "chargeback"]);
const CHARGED_BACK = new Set(["chargedBack", "chargeback"]);

export function creemEarned(transaction: CreemTransaction) {
  if (CHARGED_BACK.has(transaction.status)) return 0;
  const untaxed = untaxedAmount(transaction);
  const paid = transaction.amount_paid ?? untaxed + (transaction.tax_amount ?? 0);
  const share = paid > 0 ? untaxed / paid : 1;
  return netOf(untaxed, (transaction.refunded_amount ?? 0) * share);
}

/** The paid transactions of a window: from `since` (inclusive) to `before` (exclusive). */
export function transactionPayments(
  transactions: CreemTransaction[],
  since: number,
  before: number | null,
): ListedPayment[] {
  return transactions.flatMap((transaction) => {
    const at = unix(transaction.created_at);
    if (at === null || at < since || (before !== null && at >= before)) return [];
    if (!COUNTED.has(transaction.status)) return [];
    return [
      {
        id: transaction.id,
        at,
        fingerprint: `${transaction.status}:${transaction.refunded_amount ?? 0}`,
        value: { currency: transaction.currency, amount: creemEarned(transaction) },
        kind:
          transaction.subscription || transaction.type === "invoice" ? "subscription" : "one_time",
      },
    ];
  });
}
