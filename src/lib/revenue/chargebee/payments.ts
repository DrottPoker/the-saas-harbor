// Revenue from Chargebee invoices. Pure functions: no I/O, fully testable.
// Every invoice with a payment counts, a subscription's or one for one-time charges. It earns
// what was paid, at its untaxed share of the invoice total, so credits, write-offs and
// adjustments that were not paid do not count. Cash refunds are refundable credit notes against
// the invoice, taken off at their own untaxed share. A recurring invoice paid for a subscription;
// any other was for one-time charges.
import { netOf } from "../payments";
import type { ListedPayment } from "../types";
import type { ChargebeeCreditNote, ChargebeeInvoice } from "./mrr";

const untaxedShare = (total: number, tax: number) => (total > 0 ? (total - tax) / total : 1);

/** What credit notes refunded of each invoice, without tax. */
export function refundedByInvoice(notes: ChargebeeCreditNote[]) {
  const refunded = new Map<string, number>();
  for (const note of notes) {
    if (!note.reference_invoice_id || !note.amount_refunded) continue;
    const tax = (note.taxes ?? []).reduce((sum, entry) => sum + entry.amount, 0);
    refunded.set(
      note.reference_invoice_id,
      (refunded.get(note.reference_invoice_id) ?? 0) +
        note.amount_refunded * untaxedShare(note.total, tax),
    );
  }
  return refunded;
}

/** An invoice as a payment. Invoice ids are the site's own, so the id names the site. */
export function invoicePayments(
  site: string,
  invoices: ChargebeeInvoice[],
  refunded: ReadonlyMap<string, number>,
): ListedPayment[] {
  return invoices.map((invoice) => {
    const paid = invoice.amount_paid ?? 0;
    const back = refunded.get(invoice.id) ?? 0;
    return {
      id: `${site}:${invoice.id}`,
      at: invoice.date,
      fingerprint: `${paid}:${Math.round(back)}`,
      value: {
        currency: invoice.currency_code,
        amount: netOf(paid * untaxedShare(invoice.total ?? 0, invoice.tax ?? 0), back),
      },
      kind: (invoice.recurring ?? !!invoice.subscription_id) ? "subscription" : "one_time",
    };
  });
}
