// MRR history from paid Stripe invoices, the way revenue analytics tools reconstruct it: each
// paid subscription line contributes its monthly-normalized amount to every instant inside its
// service period. Pure functions: no I/O, fully testable.
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

export type ServiceLine = { start: number; end: number; currency: string; monthly: number };

const DAY = 86_400;
const AVERAGE_MONTH_DAYS = 365.25 / 12;

export function linePriceId(line: StripeInvoiceLine) {
  const price = line.pricing?.price_details?.price;
  return typeof price === "string" ? price : (price?.id ?? null);
}

// Months covered by one full billing interval of the price.
function intervalMonths(recurring: NonNullable<StripePrice["recurring"]>) {
  const count = recurring.interval_count;
  return {
    day: count / AVERAGE_MONTH_DAYS,
    week: (count * 7) / AVERAGE_MONTH_DAYS,
    month: count,
    year: count * 12,
  }[recurring.interval];
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

  // Prorations are already pro rata by day; full periods use the price's nominal interval so a
  // 28-day February does not inflate MRR.
  const months =
    proration || !price?.recurring ? days / AVERAGE_MONTH_DAYS : intervalMonths(price.recurring);
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

/** MRR per currency, in minor units, at one instant (period start inclusive, end exclusive). */
export function mrrAt(lines: ServiceLine[], at: number) {
  const byCurrency: Record<string, number> = {};
  for (const line of lines) {
    if (line.start <= at && at < line.end)
      byCurrency[line.currency] = (byCurrency[line.currency] ?? 0) + line.monthly;
  }
  for (const [currency, value] of Object.entries(byCurrency))
    if (value <= 0) delete byCurrency[currency];
  return byCurrency;
}

/** The last instant of each of the `count` most recent completed calendar months, oldest first. */
export function monthEnds(now: Date, count = 12) {
  const points: { month: string; at: number }[] = [];
  for (let back = count; back >= 1; back--) {
    const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 1);
    const end = new Date(nextMonthStart - 1000);
    const month = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`;
    points.push({ month, at: Math.floor(end.getTime() / 1000) });
  }
  return points;
}

/** Invoices created this far back cover every month-end in the history, annual plans included. */
export function historyWindowStart(now: Date) {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 25, 1) / 1000);
}
