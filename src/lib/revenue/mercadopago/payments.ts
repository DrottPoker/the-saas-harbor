// Revenue from Mercado Pago's payments. Pure functions: no I/O, fully testable.
// Every approved sale paid to the seller counts, dated by its approval: what was charged after the
// seller's coupon and without the tax Mercado Pago recorded on it, less refunds at the same untaxed
// share, since the refunded amount is part of the whole charge. The search lists approved payments
// only, so one refunded in full or charged back drops out, and earns nothing once its days are
// read again. A payment that names a subscription, or that Mercado Pago marks as a recurring
// charge, paid for a subscription; any other was a one-time purchase.
import { unixSeconds } from "../history";
import { netOf } from "../payments";
import type { ListedPayment } from "../types";
import {
  chargedAmount,
  isSale,
  isSubscriptionPayment,
  minorAmount,
  type MercadoPagoPayment,
} from "./mrr";

export function mercadoPagoPayments(
  payments: MercadoPagoPayment[],
  live: boolean,
  userId: string,
): ListedPayment[] {
  const listed = new Map<string, ListedPayment>();
  for (const payment of payments) {
    const at = unixSeconds(payment.date_approved);
    const charged = chargedAmount(payment);
    if (!isSale(payment, live, userId) || at === null || !charged) continue;
    const refunded = Math.max(
      0,
      minorAmount(payment.transaction_amount_refunded, charged.currency) ?? 0,
    );
    const share = charged.paid > 0 ? charged.untaxed / charged.paid : 0;
    listed.set(String(payment.id), {
      id: String(payment.id),
      at,
      fingerprint: `${Math.round(charged.gross)}:${Math.round(refunded)}`,
      value: { currency: charged.currency, amount: netOf(charged.untaxed, refunded * share) },
      kind: isSubscriptionPayment(payment) ? "subscription" : "one_time",
    });
  }
  return [...listed.values()];
}
