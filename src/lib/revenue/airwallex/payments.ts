// Revenue from Airwallex's payment intents. Pure functions: no I/O, fully testable.
// A succeeded payment intent earns what was captured, less refunds that have not failed, dated by
// when it was created. A payment for an Airwallex Billing invoice comes without the invoice's tax,
// at its untaxed share, and paid for a subscription when the invoice did. Payment Acceptance gives
// no tax for any other payment, so those count what was charged, and are one-time purchases: a
// founder's own billing that charges saved cards is not a subscription to Airwallex.
import { toMinorUnits } from "../money";
import { netOf } from "../payments";
import type { ListedPayment, PaymentKind } from "../types";
import { airwallexSeconds, type AirwallexInvoice } from "./mrr";

export type AirwallexPaymentIntent = {
  id: string;
  status?: string | null;
  amount?: number | null;
  captured_amount?: number | null;
  currency?: string | null;
  created_at?: string | null;
  /** The Airwallex Billing invoice the payment paid, if any. */
  invoice_id?: string | null;
};

export type AirwallexRefund = {
  id: string;
  payment_intent_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  /** RECEIVED, ACCEPTED, SETTLED or FAILED. */
  status?: string | null;
};

/** What refunds that have not failed took from each payment intent, in minor units. */
function refundedByIntent(refunds: AirwallexRefund[], currencies: ReadonlyMap<string, string>) {
  const refunded = new Map<string, number>();
  for (const refund of refunds) {
    const intent = refund.payment_intent_id;
    if (!intent || refund.status === "FAILED" || refund.amount == null) continue;
    const currency = currencies.get(intent);
    if (!currency || (refund.currency && refund.currency.toLowerCase() !== currency)) continue;
    refunded.set(intent, (refunded.get(intent) ?? 0) + toMinorUnits(refund.amount, currency));
  }
  return refunded;
}

/** The share of an invoice's total that is not tax, between nothing and all of it. */
function untaxedShare(invoice: AirwallexInvoice | undefined) {
  const total = invoice?.total_amount ?? 0;
  if (!invoice || total <= 0) return 1;
  return Math.min(1, Math.max(0, (total - (invoice.total_tax_amount ?? 0)) / total));
}

function kindOf(
  intent: AirwallexPaymentIntent,
  invoice: AirwallexInvoice | undefined,
): PaymentKind {
  if (!intent.invoice_id) return "one_time";
  // An invoice outside the invoices read leaves the kind open.
  if (!invoice) return "unknown";
  return invoice.subscription_id ? "subscription" : "one_time";
}

export function airwallexPayments(
  intents: AirwallexPaymentIntent[],
  refunds: AirwallexRefund[],
  invoices: ReadonlyMap<string, AirwallexInvoice>,
): ListedPayment[] {
  const succeeded = intents.filter((intent) => intent.status === "SUCCEEDED" && intent.currency);
  const currencies = new Map(
    succeeded.map((intent) => [intent.id, intent.currency!.toLowerCase()] as const),
  );
  const refunded = refundedByIntent(refunds, currencies);
  const payments = new Map<string, ListedPayment>();
  for (const intent of succeeded) {
    const at = airwallexSeconds(intent.created_at);
    const captured = intent.captured_amount ?? 0;
    const charged = captured > 0 ? captured : (intent.amount ?? 0);
    const currency = intent.currency!.toLowerCase();
    if (at === null || !(charged > 0)) continue;
    const gross = toMinorUnits(charged, currency);
    const back = refunded.get(intent.id) ?? 0;
    const invoice = intent.invoice_id ? invoices.get(intent.invoice_id) : undefined;
    const share = untaxedShare(invoice);
    payments.set(intent.id, {
      id: intent.id,
      at,
      fingerprint: `${Math.round(gross)}:${Math.round(back)}:${share.toFixed(6)}`,
      value: { currency, amount: netOf(gross, back) * share },
      kind: kindOf(intent, invoice),
    });
  }
  return [...payments.values()];
}
