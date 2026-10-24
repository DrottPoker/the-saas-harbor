// Revenue from PayPal's transactions. Pure functions: no I/O, fully testable.
// Payments that came in from customers count, at their gross amount less the tax PayPal reports.
// Refunds, reversals and chargebacks name the payment they take from, and come off at its untaxed
// share, as long as the same read lists both; a payment refunded in full is marked so itself and
// earns nothing. A subscription's payment (T0002) paid for a subscription; any other was one-time.
import { netOf } from "../payments";
import type { ListedPayment } from "../types";
import {
  minorAmount,
  paypalSeconds,
  SUBSCRIPTION_PAYMENT,
  untaxedAmount,
  type PayPalTransaction,
} from "./mrr";

/**
 * Event codes of payments from customers: general, subscription, pre-approved, card, checkout,
 * website, mobile, virtual terminal, PayPal Here and other funded payments. Donations, mass
 * payments, auctions and transfers are not sales.
 */
export const CUSTOMER_PAYMENTS = new Set([
  "T0000",
  "T0002",
  "T0003",
  "T0005",
  "T0006",
  "T0007",
  "T0011",
  "T0012",
  "T0018",
  "T0019",
]);

/** Event codes that take money from a payment, or give it back: refunds, reversals, chargebacks. */
export const ADJUSTMENTS = new Set(["T1106", "T1107", "T1201", "T1202"]);

/** What adjustments took from each payment, in minor units with tax. */
function takenBack(transactions: PayPalTransaction[]) {
  const back = new Map<string, number>();
  for (const transaction of transactions) {
    const payment = transaction.paypal_reference_id;
    if (
      !ADJUSTMENTS.has(transaction.transaction_event_code ?? "") ||
      transaction.transaction_status !== "S" ||
      transaction.paypal_reference_id_type !== "TXN" ||
      !payment
    )
      continue;
    const amount = minorAmount(transaction.transaction_amount);
    if (amount !== null) back.set(payment, (back.get(payment) ?? 0) - amount);
  }
  return back;
}

export function paypalPayments(transactions: PayPalTransaction[]): ListedPayment[] {
  const back = takenBack(transactions);
  const payments = new Map<string, ListedPayment>();
  for (const transaction of transactions) {
    const code = transaction.transaction_event_code ?? "";
    const status = transaction.transaction_status;
    if (!CUSTOMER_PAYMENTS.has(code) || (status !== "S" && status !== "V")) continue;
    const at = paypalSeconds(transaction.transaction_initiation_date);
    const amount = untaxedAmount(transaction);
    if (at === null || !amount) continue;
    const refunded = Math.max(0, back.get(transaction.transaction_id) ?? 0);
    payments.set(transaction.transaction_id, {
      id: transaction.transaction_id,
      at,
      fingerprint: `${status}:${Math.round(amount.gross)}:${Math.round(refunded)}`,
      value: {
        currency: transaction.transaction_amount!.currency_code.toLowerCase(),
        amount: status === "V" ? 0 : netOf(amount.net, (refunded * amount.net) / amount.gross),
      },
      kind: code === SUBSCRIPTION_PAYMENT ? "subscription" : "one_time",
    });
  }
  return [...payments.values()];
}
