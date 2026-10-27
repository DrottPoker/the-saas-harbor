// Revenue from Asaas charges. Pure functions: no I/O, fully testable.
// Every paid charge counts, subscriptions and one-time charges alike, dated by the day it was paid:
// what was paid, less refunds that are done or under way, and nothing while a chargeback is open or
// once the charge is refunded, which is also where a lost chargeback ends. Charges carry no tax, so
// what was paid counts. A charge marked received in cash moved no money through Asaas, and one that
// Asaas created for a Pix or TED transfer into the account records a transfer rather than a sale,
// so neither counts. A charge of a subscription paid for one; any other was one-time.
import { netOf } from "../payments";
import { toMinorUnits } from "../money";
import type { ListedPayment } from "../types";
import { CURRENCY, dateStart, type AsaasPayment } from "./mrr";

/** Paid, and keeping what refunds leave of it. */
const EARNING = new Set(["RECEIVED", "CONFIRMED", "AWAITING_CHARGEBACK_REVERSAL"]);
/** Paid, with a refund under way: what its refunds leave, or nothing when it lists none. */
const REFUNDING = new Set(["REFUND_REQUESTED", "REFUND_IN_PROGRESS"]);
/** Paid, then refunded or in a chargeback: nothing. */
const TAKEN_BACK = new Set(["REFUNDED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"]);

/** The description Asaas gives a charge it created for a Pix or TED transfer it received. */
const TRANSFER_DESCRIPTION =
  /automaticamente a partir de (pix|ted) recebid|automatically (created|generated) from a received (pix|ted)/i;

/**
 * A charge Asaas created for money transferred into the account, which may be the founder's own:
 * one with that description and no origin, such as a subscription, a payment link or a static Pix
 * QR Code, whose payments are sales.
 */
export function isReceivedTransfer(payment: AsaasPayment) {
  return (
    !payment.subscription &&
    !payment.installment &&
    !payment.paymentLink &&
    !payment.checkoutSession &&
    !payment.pixQrCodeId &&
    TRANSFER_DESCRIPTION.test(payment.description ?? "")
  );
}

/** What refunds that are done or under way took, in minor units. */
export function refundedAmount(payment: AsaasPayment) {
  let refunded = 0;
  for (const refund of payment.refunds ?? [])
    if (refund?.status !== "CANCELLED") refunded += Math.max(0, Number(refund?.value) || 0);
  return toMinorUnits(refunded, CURRENCY);
}

/** When a charge was paid. */
export function paidAt(payment: AsaasPayment) {
  return (
    dateStart(payment.paymentDate) ??
    dateStart(payment.clientPaymentDate) ??
    dateStart(payment.confirmedDate)
  );
}

export function asaasPayments(
  payments: AsaasPayment[],
  since: number,
  before: number | null,
): ListedPayment[] {
  const listed = new Map<string, ListedPayment>();
  for (const payment of payments) {
    const { status } = payment;
    if (payment.deleted || isReceivedTransfer(payment)) continue;
    if (!EARNING.has(status) && !REFUNDING.has(status) && !TAKEN_BACK.has(status)) continue;
    const at = paidAt(payment);
    if (at === null || at < since || (before !== null && at >= before)) continue;
    const gross = Math.max(0, toMinorUnits(payment.value, CURRENCY));
    const refunded = refundedAmount(payment);
    let amount = netOf(gross, refunded);
    if (TAKEN_BACK.has(status) || (REFUNDING.has(status) && !payment.refunds?.length)) amount = 0;
    listed.set(payment.id, {
      id: payment.id,
      at,
      fingerprint: `${status}:${Math.round(gross)}:${Math.round(refunded)}`,
      value: { currency: CURRENCY, amount },
      kind: payment.subscription ? "subscription" : "one_time",
    });
  }
  return [...listed.values()];
}
