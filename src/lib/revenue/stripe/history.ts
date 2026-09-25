// Service lines from paid Stripe invoices, for the MRR history (see ../history.ts). Pure functions:
// no I/O, fully testable.
import type { ServiceLine } from "../history";
import { AVERAGE_MONTH_DAYS, intervalMonths as monthsIn } from "../money";
import type { StripePrice } from "./mrr";

export type StripeInvoiceLine = {
  id: string;
  amount: number;
  currency: string;
  period: { start: number; end: number };
  discount_amounts?: { amount: number }[] | null;
  taxes?: { amount: number; tax_behavior: "inclusive" | "exclusive" }[] | null;
  parent: {
    type: string;
    subscription_item_details?: { proration: boolean; subscription: string | null } | null;
    invoice_item_details?: { proration: boolean; subscription: string | null } | null;
  } | null;
  pricing: { price_details?: { price: string | StripePrice } | null } | null;
};

export type StripeInvoice = {
  id: string;
  lines: { data: StripeInvoiceLine[]; has_more: boolean };
};

const DAY = 86_400;

export function linePriceId(line: StripeInvoiceLine) {
  const price = line.pricing?.price_details?.price;
  return typeof price === "string" ? price : (price?.id ?? null);
}

// Months covered by one full billing interval of the price.
function intervalMonths(recurring: NonNullable<StripePrice["recurring"]>) {
  return monthsIn(recurring.interval, recurring.interval_count);
}

// The start of the billing period that ends at `end`: one interval of the price earlier, with the
// day of the month capped at the month's last day, as Stripe bills a subscription begun on the 31st.
function periodStart(end: number, recurring: NonNullable<StripePrice["recurring"]>) {
  const count = recurring.interval_count;
  if (recurring.interval === "day") return end - count * DAY;
  if (recurring.interval === "week") return end - count * 7 * DAY;
  const date = new Date(end * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - (recurring.interval === "month" ? count : count * 12);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  const time = end * 1000 - Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  return (Date.UTC(year, month, day) + time) / 1000;
}

/**
 * Converts one invoice line into a monthly rate over its service period, or null when it does not
 * count toward MRR: one-off charges, metered usage and empty periods.
 */
export function serviceLine(
  line: StripeInvoiceLine,
  prices: ReadonlyMap<string, StripePrice>,
): ServiceLine | null {
  const subscriptionDetails = line.parent?.subscription_item_details;
  const itemDetails = line.parent?.invoice_item_details;
  const proration = !!(subscriptionDetails?.proration || itemDetails?.proration);
  const fromSubscription =
    line.parent?.type === "subscription_item_details" || (proration && !!itemDetails?.subscription);
  if (!fromSubscription) return null;

  const priceId = linePriceId(line);
  const price = priceId ? prices.get(priceId) : undefined;
  if (price?.recurring?.usage_type === "metered") return null;

  const days = (line.period.end - line.period.start) / DAY;
  if (days <= 0) return null;
  const discounts = (line.discount_amounts ?? []).reduce((sum, d) => sum + d.amount, 0);
  const includedTax = (line.taxes ?? [])
    .filter((tax) => tax.tax_behavior === "inclusive")
    .reduce((sum, tax) => sum + tax.amount, 0);
  const net = line.amount - discounts - includedTax;

  // A full period counts at the price's interval, so a 28-day February does not inflate MRR. A
  // proration counts at its share of the billing period it falls in, which ends where it ends.
  let months = days / AVERAGE_MONTH_DAYS;
  if (price?.recurring) {
    const interval = intervalMonths(price.recurring);
    const periodDays = (line.period.end - periodStart(line.period.end, price.recurring)) / DAY;
    months = proration ? (days / periodDays) * interval : interval;
  }
  return {
    start: line.period.start,
    end: line.period.end,
    currency: line.currency.toLowerCase(),
    monthly: net / months,
  };
}

export function serviceLines(invoices: StripeInvoice[], prices: ReadonlyMap<string, StripePrice>) {
  return invoices.flatMap((invoice) =>
    invoice.lines.data
      .map((line) => serviceLine(line, prices))
      .filter((line): line is ServiceLine => line !== null),
  );
}
