// Revenue from Zoho Billing's customer payments. Pure functions: no I/O, fully testable.
// Every successful payment counts, for a subscription or for anything else, at what was received
// less what was refunded of it. Zoho's payments carry no tax figure, so they count with the tax
// that was charged. A payment does not say what it paid for: only the invoices it was applied to
// do, at a request each, which Zoho's daily API limit does not allow for every payment, so its
// kind is unknown and its months show totals only. A payment without a currency is in the
// organization's own, and is dated by the day Zoho gives it.
import { toMinorUnits } from "../money";
import { dayStart, netOf } from "../payments";
import type { ListedPayment } from "../types";
import { majorAmount } from "./mrr";

export type ZohoPayment = {
  payment_id: string | number;
  /** The day it was received, as YYYY-MM-DD. */
  date?: string | null;
  /** success or failure. */
  status?: string | null;
  /** What was received, in major units. */
  amount?: number | string | null;
  amount_refunded?: number | string | null;
  currency_code?: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}/;

/** Payments as listed: their ids are the organization's own, so each names the organization. */
export function zohoPayments(
  organizationId: string,
  payments: ZohoPayment[],
  organizationCurrency: string | null,
): ListedPayment[] {
  const listed = new Map<string, ListedPayment>();
  for (const payment of payments) {
    const id = String(payment.payment_id ?? "");
    const day = payment.date?.match(DAY)?.[0];
    const amount = majorAmount(payment.amount);
    const currency = (payment.currency_code || organizationCurrency)?.toLowerCase();
    if (!id || payment.status !== "success" || !day || amount === null || !currency) continue;
    const refunded = majorAmount(payment.amount_refunded) ?? 0;
    listed.set(id, {
      id: `${organizationId}:${id}`,
      at: dayStart(day),
      fingerprint: `${amount}:${refunded}`,
      value: {
        currency,
        amount: netOf(toMinorUnits(amount, currency), toMinorUnits(refunded, currency)),
      },
      kind: "unknown",
    });
  }
  return [...listed.values()];
}

/** Whether a payment is needed for the window `[since, before)`. */
export function inWindow(payment: ListedPayment, since: number, before: number | null) {
  return payment.at >= since && (before === null || payment.at < before);
}
