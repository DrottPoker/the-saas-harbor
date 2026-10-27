// Revenue from Paystack transactions. Pure functions: no I/O, fully testable.
// Every paid transaction counts, a subscription's charge or a one-time payment. It earns what the
// merchant asked for, without Paystack's fees where they were passed on to the customer, less its
// refunds at the same share. Paystack records no tax, so what was charged counts. A transaction
// with a refund under way is marked reversal pending, and one with a refund done, in full or in
// part, reversed; a refund that failed makes it a success again and does not count. A lost
// dispute is refunded the same way. A transaction with a plan paid for a subscription; any other
// was a one-time purchase.
import { netOf } from "../payments";
import type { ListedPayment } from "../types";
import { charged, paidAt, paystackMinor, transactionPlan, type PaystackTransaction } from "./mrr";

export type PaystackRefund = {
  id: number;
  /** The refunded transaction's id, or the transaction itself. */
  transaction: number | { id: number } | null;
  amount: number;
  currency: string;
  /** pending, processing, needs-attention, processed or failed. */
  status: string;
};

/** Whether a transaction's status says a refund of it is under way or done. */
export function refundedStatus(status: string) {
  return status === "reversed" || /^reversal[ _-]?pending$/i.test(status);
}

/** What the refunds that did not fail took from each transaction, in Paystack's units. */
export function refundedByTransaction(refunds: PaystackRefund[]) {
  const back = new Map<number, number>();
  const seen = new Set<number>();
  for (const refund of refunds) {
    if (refund.status === "failed" || seen.has(refund.id)) continue;
    seen.add(refund.id);
    const id = typeof refund.transaction === "object" ? refund.transaction?.id : refund.transaction;
    if (id == null) continue;
    back.set(Number(id), (back.get(Number(id)) ?? 0) + refund.amount);
  }
  return back;
}

/** The paid transactions of a window: paid from `since` (inclusive) to `before` (exclusive). */
export function paystackPayments(
  transactions: PaystackTransaction[],
  refunds: PaystackRefund[],
  since: number,
  before: number | null,
): ListedPayment[] {
  const back = refundedByTransaction(refunds);
  const payments = new Map<string, ListedPayment>();
  for (const transaction of transactions) {
    const { status, amount, currency } = transaction;
    if ((status !== "success" && !refundedStatus(status)) || !(amount > 0)) continue;
    const at = paidAt(transaction);
    if (at === null || at < since || (before !== null && at >= before)) continue;
    // A refund that the refunds read do not show took all of it.
    const refunded = Math.min(
      amount,
      back.get(transaction.id) ?? (refundedStatus(status) ? amount : 0),
    );
    const asked = charged(transaction);
    payments.set(String(transaction.id), {
      id: String(transaction.id),
      at,
      fingerprint: `${status}:${refunded}`,
      value: {
        currency: currency.toLowerCase(),
        amount: paystackMinor(netOf(asked, (refunded * asked) / amount), currency),
      },
      kind: transactionPlan(transaction) ? "subscription" : "one_time",
    });
  }
  return [...payments.values()];
}
