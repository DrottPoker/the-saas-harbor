// Revenue from Stripe charges. Pure functions: no I/O, fully testable.
// A charge is every kind of payment: invoices, Checkout, Payment Links and direct payments. It
// earns what was captured, less refunds and lost disputes, without tax. A charge does not carry
// its tax, so the untaxed share comes from the invoice it paid or the Checkout Session that took
// it; a charge with neither had no tax that Stripe recorded. The same invoice or session tells
// whether it paid for a subscription: an invoice of a subscription did, while a one-off invoice,
// a Checkout Session in payment mode and a charge with neither are one-time purchases.
import { netOf } from "../payments";
import type { ListedPayment, PaymentKind, StoredPayment } from "../types";

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
  billing_reason?: string | null;
  parent?: { type: string } | null;
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

/** What a charge's invoice or Checkout Session tells: its untaxed share, and what it paid for. */
export type ChargeFacts = { share: number; kind: PaymentKind };

/** Whether an invoice belongs to a subscription, by its parent or why it was billed. */
export function subscriptionInvoice(invoice: StripePaidInvoice) {
  return (
    invoice.parent?.type === "subscription_details" ||
    (invoice.billing_reason ?? "").startsWith("subscription")
  );
}

/**
 * The facts of each payment, by payment intent or charge id: an invoice's total without tax
 * against its total, or a Checkout Session's total without tax against its total, and whether the
 * invoice belongs to a subscription. A ratio holds in any currency, so a session shown in the
 * buyer's currency gives the same share. A session has a payment intent in payment mode only, so
 * it took a one-time purchase.
 */
export function paymentFacts(invoices: StripePaidInvoice[], sessions: StripeCheckoutSession[]) {
  const facts = new Map<string, ChargeFacts>();
  for (const invoice of invoices) {
    const share =
      invoice.total > 0 && invoice.total_excluding_tax !== null
        ? invoice.total_excluding_tax / invoice.total
        : 1;
    const kind = subscriptionInvoice(invoice) ? "subscription" : "one_time";
    for (const { payment } of invoice.payments?.data ?? []) {
      const id = idOf(payment.payment_intent) ?? idOf(payment.charge);
      if (id) facts.set(id, { share, kind });
    }
  }
  for (const session of sessions) {
    const id = idOf(session.payment_intent);
    if (!id || session.payment_status !== "paid" || !session.amount_total) continue;
    facts.set(id, {
      share:
        (session.amount_total - (session.total_details?.amount_tax ?? 0)) / session.amount_total,
      kind: "one_time",
    });
  }
  return facts;
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
 * The facts that need no request: changed charges keep the share and kind they were stored with.
 * Unchanged charges need none, and `needed` are the charges whose invoice or session must be read,
 * stored ones without a kind included.
 */
export function knownFacts(
  charges: StripeCharge[],
  lost: ReadonlyMap<string, number>,
  stored: (id: string) => StoredPayment | null,
) {
  const facts = new Map<string, ChargeFacts>();
  const needed: StripeCharge[] = [];
  for (const charge of charges) {
    const previous = stored(charge.id);
    if (!previous?.kind) {
      needed.push(charge);
      continue;
    }
    if (previous.fingerprint === chargeFingerprint(charge, lost.get(charge.id) ?? 0)) continue;
    const share = storedShare(previous);
    if (share === null) needed.push(charge);
    else facts.set(charge.id, { share, kind: previous.kind });
  }
  return { facts, needed };
}

/**
 * Each needed charge's facts, by its payment intent or its own id. A charge with neither an
 * invoice nor a session was a one-time payment without tax that Stripe recorded.
 */
export function factsOf(needed: StripeCharge[], found: ReadonlyMap<string, ChargeFacts>) {
  const facts = new Map<string, ChargeFacts>();
  for (const charge of needed) {
    const intent = idOf(charge.payment_intent);
    facts.set(
      charge.id,
      (intent ? found.get(intent) : undefined) ??
        found.get(charge.id) ?? { share: 1, kind: "one_time" },
    );
  }
  return facts;
}

/** The listed payments of paid charges, valued where facts are given and unvalued otherwise. */
export function chargePayments(
  charges: StripeCharge[],
  lost: ReadonlyMap<string, number>,
  facts: ReadonlyMap<string, ChargeFacts>,
): ListedPayment[] {
  return charges.map((charge) => {
    const lostAmount = lost.get(charge.id) ?? 0;
    const known = facts.get(charge.id);
    return {
      id: charge.id,
      at: charge.created,
      fingerprint: chargeFingerprint(charge, lostAmount),
      value: known
        ? {
            currency: charge.currency,
            amount: kept(charge.amount_captured, charge.amount_refunded, lostAmount) * known.share,
          }
        : null,
      kind: known?.kind ?? null,
    };
  });
}
