// Revenue from Paddle transactions. Pure functions: no I/O, fully testable.
// Every completed transaction is a payment, a subscription's or a one-time purchase. It earns
// what the customer was charged without tax: the grand total, which leaves out credit from
// earlier transactions, less its tax. Refunds and chargebacks are adjustments, which leave the
// transaction's totals as they were and show in its adjusted totals, so what they took back
// without tax is subtracted.
import { unixSeconds } from "../history";
import { netOf } from "../payments";
import type { ListedPayment } from "../types";
import type { PaddleTransaction, PaddleTransactionTotals } from "./mrr";

const amount = (value: string | undefined) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const untaxed = (totals: PaddleTransactionTotals) => amount(totals.total) - amount(totals.tax);

/** What a transaction earned: charged without tax, less adjustments without tax. */
export function transactionEarned(transaction: PaddleTransaction) {
  const totals = transaction.details.totals;
  if (!totals) return 0;
  const charged =
    totals.grand_total !== undefined
      ? amount(totals.grand_total) - amount(totals.grand_total_tax)
      : untaxed(totals);
  const adjusted = transaction.details.adjusted_totals;
  const takenBack = adjusted ? Math.max(0, untaxed(totals) - untaxed(adjusted)) : 0;
  return netOf(charged, takenBack);
}

/** The fingerprint of a transaction: its adjusted totals, which adjustments change. */
export function transactionFingerprint(transaction: PaddleTransaction) {
  const totals = transaction.details.adjusted_totals ?? transaction.details.totals;
  return `${totals?.total ?? ""}:${totals?.tax ?? ""}`;
}

export function transactionPayments(transactions: PaddleTransaction[]): ListedPayment[] {
  return transactions.flatMap((transaction) => {
    const at = unixSeconds(transaction.billed_at);
    if (at === null) return [];
    return [
      {
        id: transaction.id,
        at,
        fingerprint: transactionFingerprint(transaction),
        value: { currency: transaction.currency_code, amount: transactionEarned(transaction) },
      },
    ];
  });
}
