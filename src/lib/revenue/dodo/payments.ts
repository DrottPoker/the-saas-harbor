// Revenue from Dodo Payments. Pure functions: no I/O, fully testable.
// Every successful payment counts, a subscription's or a one-time purchase. Its total includes
// tax, which only the payment read alone shows, with its refunds and disputes: it earns its total
// without tax, less its successful refunds at the same untaxed share, and nothing once a dispute
// is lost. The list shows whether a payment was refunded or disputed, which is its fingerprint.
import { netOf } from "../payments";
import type { DodoListedPayment, DodoPaymentDetail } from "./mrr";

const LOST = new Set(["dispute_lost", "dispute_accepted"]);

export function dodoFingerprint(payment: DodoListedPayment) {
  return `${payment.total_amount}:${payment.refund_status ?? ""}:${payment.dispute_status ?? ""}`;
}

/** What a payment earned, from the payment read alone. */
export function dodoEarned(payment: DodoPaymentDetail) {
  if ((payment.disputes ?? []).some((dispute) => LOST.has(dispute.dispute_status))) return 0;
  const untaxed = payment.total_amount - (payment.tax ?? 0);
  const share = payment.total_amount > 0 ? untaxed / payment.total_amount : 1;
  const refunded = (payment.refunds ?? [])
    .filter((refund) => refund.status === "succeeded")
    .reduce((sum, refund) => sum + (refund.amount ?? 0), 0);
  return netOf(untaxed, refunded * share);
}
