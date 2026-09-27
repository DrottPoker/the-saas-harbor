// Revenue from Stripe charges. Pure functions: no I/O, fully testable.
// A charge is every kind of payment: invoices, Checkout, Payment Links and direct payments. It
// earns what was captured, less refunds and lost disputes, without tax. A charge does not carry
// its tax, so the untaxed share comes from the invoice it paid or the Checkout Session that took
// it; a charge with neither had no tax that Stripe recorded.
import { netOf } from "../payments";
import type { ListedPayment, StoredPayment } from "../types";

export type StripeCharge = {
  id: string;
  amount_captured: number;
  amount_refunded: number;
  captured: boolean;
  currency: string;
  created: number;
  disputed: boolean;
  status: string;
  payment_intent: string | { id: string } | null;
};

export type StripeDispute = {
  id: string;
  charge: string | { id: string };
  amount: number;
  status: string;
};

type Ref = string | { id: string } | null | undefined;

export type StripePaidInvoice = {
  id: string;
  total: number;
  total_excluding_tax: number | null;
  payments?: {
    data: { payment: { type: string; payment_intent?: Ref; charge?: Ref } }[];
  } | null;
};

export type StripeCheckoutSession = {
  id: string;
  payment_intent: Ref;
  payment_status: string;
  amount_total: number | null;
  total_details?: { amount_tax?: number | null } | null;
};

const idOf = (ref: Ref) => (typeof ref === "string" ? ref : (ref?.id ?? null));

/** A captured charge that succeeded; authorizations and failures earned nothing. */
export function isPaid(charge: StripeCharge) {
  return charge.status === "succeeded" && charge.captured;
}

/** What lost disputes took back from each charge. */
export function lostByCharge(disputes: StripeDispute[]) {
  const lost = new Map<string, number>();
  for (const dispute of disputes) {
    const charge = idOf(dispute.charge);
    if (dispute.status === "lost" && charge)
      lost.set(charge, (lost.get(charge) ?? 0) + dispute.amount);
  }
  return lost;
}

/** The fingerprint of a charge: what was captured, refunded and lost in disputes. */
export function chargeFingerprint(charge: StripeCharge, lost: number) {
  return `${charge.amount_captured}:${charge.amount_refunded}:${lost}`;
}

/** What a charge kept, tax included: captured, less refunds and lost disputes. */
function kept(captured: number, refunded: number, lost: number) {
  return netOf(captured, refunded + lost);
}

/**
 * The untaxed share of each payment, by payment intent or charge id: an invoice's total without
 * tax against its total, or a Checkout Session's total without tax against its total. A ratio
 * holds in any currency, so a session shown in the buyer's currency gives the same share.
 */
export function untaxedShares(invoices: StripePaidInvoice[], sessions: StripeCheckoutSession[]) {
  const shares = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.total <= 0 || invoice.total_excluding_tax === null) continue;
    const share = invoice.total_excluding_tax / invoice.total;
    for (const { payment } of invoice.payments?.data ?? []) {
      const id = idOf(payment.payment_intent) ?? idOf(payment.charge);
      if (id) shares.set(id, share);
    }
  }
  for (const session of sessions) {
    const id = idOf(session.payment_intent);
    if (!id || session.payment_status !== "paid" || !session.amount_total) continue;
    shares.set(
      id,
      (session.amount_total - (session.total_details?.amount_tax ?? 0)) / session.amount_total,
    );
  }
  return shares;
}

/**
 * The untaxed share a changed charge was stored with, from what it kept then (in its old
 * fingerprint) and what it earned; null when it had kept nothing, so the share is unknown.
 */
export function storedShare(stored: StoredPayment) {
  const [captured, refunded, lost] = stored.fingerprint.split(":").map(Number);
  const before = kept(captured, refunded, lost);
  if (!Number.isFinite(before) || before <= 0) return null;
  return Math.min(1, Math.max(0, stored.amount / before));
}

/**
 * The untaxed shares that need no request: changed charges keep the share they were stored with.
 * Unchanged charges need none, and `needed` are the charges whose invoice or session must be read.
 */
export function knownShares(
  charges: StripeCharge[],
  lost: ReadonlyMap<string, number>,
  stored: (id: string) => StoredPayment | null,
) {
  const shares = new Map<string, number>();
  const needed: StripeCharge[] = [];
  for (const charge of charges) {
    const previous = stored(charge.id);
    if (previous?.fingerprint === chargeFingerprint(charge, lost.get(charge.id) ?? 0)) continue;
    const share = previous ? storedShare(previous) : null;
    if (share === null) needed.push(charge);
    else shares.set(charge.id, share);
  }
  return { shares, needed };
}

/** Each needed charge's share, by its payment intent or its own id; 1 when it had no tax. */
export function sharesOf(needed: StripeCharge[], untaxed: ReadonlyMap<string, number>) {
  const shares = new Map<string, number>();
  for (const charge of needed) {
    const intent = idOf(charge.payment_intent);
    shares.set(
      charge.id,
      (intent ? untaxed.get(intent) : undefined) ?? untaxed.get(charge.id) ?? 1,
    );
  }
  return shares;
}

/** The listed payments of paid charges, valued where a share is given and unvalued otherwise. */
export function chargePayments(
  charges: StripeCharge[],
  lost: ReadonlyMap<string, number>,
  shares: ReadonlyMap<string, number>,
): ListedPayment[] {
  return charges.map((charge) => {
    const lostAmount = lost.get(charge.id) ?? 0;
    const share = shares.get(charge.id);
    return {
      id: charge.id,
      at: charge.created,
      fingerprint: chargeFingerprint(charge, lostAmount),
      value:
        share === undefined
          ? null
          : {
              currency: charge.currency,
              amount: kept(charge.amount_captured, charge.amount_refunded, lostAmount) * share,
            },
    };
  });
}
