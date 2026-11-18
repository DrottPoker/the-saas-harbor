// Revenue from Dodo Payments. Pure functions: no I/O, fully testable.
// Every successful payment counts, a subscription's or a one-time purchase. Its total includes
// tax, which only the payment read alone shows, with its refunds and disputes: it earns its total
// without tax, less its successful refunds at the same untaxed share, and nothing once a dispute
// is lost. The list shows whether a payment was refunded or disputed, which is its fingerprint,
// and the subscription it paid for, which a one-time payment has none of. A payment refunded in
// part can be refunded again without the list showing it, so it is valued on every read and its
// fingerprint carries what it earned.
import { netOf } from "../payments";
import type { PaymentKind } from "../types";
import type { DodoListedPayment, DodoPaymentDetail } from "./mrr";

const LOST = new Set(["dispute_lost", "dispute_accepted"]);

export function dodoFingerprint(payment: DodoListedPayment) {
  return `${payment.total_amount}:${payment.refund_status ?? ""}:${payment.dispute_status ?? ""}`;
}

/** Whether a payment's refunds can grow while the list still shows the same status. */
export function dodoRefundedInPart(payment: DodoListedPayment) {
  return (payment.refund_status ?? "").toLowerCase() === "partial";
}

/** The fingerprint of a payment refunded in part: what the list shows, and what it earned. */
export function dodoPartFingerprint(payment: DodoListedPayment, earned: number) {
  return `${dodoFingerprint(payment)}:${Math.round(earned)}`;
}

export function dodoKind(payment: DodoListedPayment): PaymentKind {
  return payment.subscription_id || payment.subscription_ids?.length ? "subscription" : "one_time";
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
