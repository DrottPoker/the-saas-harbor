// Monthly recurring revenue from Chargebee. Pure functions: no I/O, fully testable.
// Definition, as for every provider: active and past-due subscriptions, their recurring charge
// normalized to a month, after ongoing discounts, before tax. Chargebee has no past-due status: a
// subscription whose payment failed stays active. Prices may include tax depending on the site
// and the customer, which only invoices show, so each subscription is valued by its latest paid
// invoice with a full period of its plan: the plan and addon lines, without metered usage, after
// the coupons and discounts the subscription still has and without tax. Credits are not
// discounts and are added back. A subscription without such an invoice is not counted. Trials,
// paused and future subscriptions are not counted; one set to cancel at the end of its term is.
import { historyWindowStart, type ServiceLine } from "../history";
import { addTo, AVERAGE_MONTH_DAYS, intervalMonths, periodMonths, type Interval } from "../money";

export type ChargebeeSubscription = {
  id: string;
  status: string;
  customer_id: string;
  currency_code: string;
  billing_period?: number | null;
  billing_period_unit?: Interval | null;
  current_term_start?: number | null;
  coupons?: { coupon_id: string }[] | null;
  discounts?: { id: string; coupon_id?: string | null }[] | null;
};
export type ChargebeeLineItem = {
  id: string;
  subscription_id?: string | null;
  date_from: number;
  date_to: number;
  amount: number;
  discount_amount?: number | null;
  tax_amount?: number | null;
  entity_type: string;
  metered?: boolean | null;
};
export type ChargebeeLineDiscount = {
  line_item_id: string;
  discount_type: string;
  coupon_id?: string | null;
  entity_id?: string | null;
  discount_amount: number;
};
export type ChargebeeInvoice = {
  id: string;
  status: string;
  price_type: string;
  currency_code: string;
  date: number;
  line_items?: ChargebeeLineItem[] | null;
  line_item_discounts?: ChargebeeLineDiscount[] | null;
};

export const COUNTED_STATUSES = ["active", "non_renewing"] as const;
const RECURRING = new Set(["plan_item_price", "addon_item_price"]);
const CREDITS = new Set(["promotional_credits", "prorated_credits"]);
const DAY = 86_400;

function cycle(subscription: ChargebeeSubscription) {
  const unit = subscription.billing_period_unit;
  return unit ? intervalMonths(unit, subscription.billing_period ?? 1) : null;
}

const recurringLine = (line: ChargebeeLineItem) =>
  RECURRING.has(line.entity_type) &&
  !line.metered &&
  !!line.subscription_id &&
  line.date_to > line.date_from;

/**
 * A line's amount after the discounts `keep` accepts and without tax. Where prices include tax,
 * the tax is taken out at the share the line was charged at.
 */
function lineValue(
  invoice: ChargebeeInvoice,
  line: ChargebeeLineItem,
  keep: (discount: ChargebeeLineDiscount) => boolean,
) {
  const listed = (invoice.line_item_discounts ?? []).filter((d) => d.line_item_id === line.id);
  const sum = (discounts: ChargebeeLineDiscount[]) =>
    discounts.reduce((total, d) => total + d.discount_amount, 0);
  const all = listed.length ? sum(listed) : (line.discount_amount ?? 0);
  const kept = listed.length
    ? sum(listed.filter((d) => !CREDITS.has(d.discount_type) && keep(d)))
    : all;
  const charged = line.amount - all;
  const tax = invoice.price_type === "tax_inclusive" ? (line.tax_amount ?? 0) : 0;
  const untaxed = charged > 0 ? (charged - tax) / charged : 1;
  return (line.amount - kept) * untaxed;
}

/** Invoices dated since this instant hold each counted subscription's latest full charge. */
export function invoiceWindowStart(subscriptions: ChargebeeSubscription[], now: Date) {
  let start = Math.floor(now.getTime() / 1000);
  for (const subscription of subscriptions) {
    const months = cycle(subscription) ?? 12;
    const term = subscription.current_term_start ?? start;
    start = Math.min(start, Math.floor(term - months * AVERAGE_MONTH_DAYS * DAY - 2 * DAY));
  }
  return Math.max(start, historyWindowStart(now));
}

/** Whether a line covers a whole billing cycle of its subscription. */
function fullPeriod(line: ChargebeeLineItem, months: number) {
  return Math.abs(periodMonths(line.date_from, line.date_to) - months) / months < 0.02;
}

export function chargebeeMrr(subscriptions: ChargebeeSubscription[], invoices: ChargebeeInvoice[]) {
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  const seen = new Set<string>();
  for (const subscription of subscriptions) {
    if (!(COUNTED_STATUSES as readonly string[]).includes(subscription.status)) continue;
    if (seen.has(subscription.id)) continue;
    seen.add(subscription.id);
    subscriptionIds.push(subscription.id);
    const months = cycle(subscription);
    const own = (line: ChargebeeLineItem) =>
      recurringLine(line) && line.subscription_id === subscription.id;
    // The latest paid invoice with a full cycle of the subscription's plan.
    let latest: ChargebeeInvoice | null = null;
    for (const invoice of invoices) {
      if (invoice.status !== "paid") continue;
      const full = (invoice.line_items ?? []).some(
        (line) =>
          own(line) &&
          line.entity_type === "plan_item_price" &&
          months !== null &&
          fullPeriod(line, months),
      );
      if (full && (!latest || invoice.date > latest.date)) latest = invoice;
    }
    if (!latest) {
      skippedItems++;
      continue;
    }
    const current = new Set([
      ...(subscription.coupons ?? []).map((c) => c.coupon_id),
      ...(subscription.discounts ?? []).flatMap((d) => [d.id, d.coupon_id ?? ""]),
    ]);
    const ongoing = (d: ChargebeeLineDiscount) =>
      current.has(d.entity_id ?? "") || current.has(d.coupon_id ?? "");
    let monthly = 0;
    for (const line of (latest.line_items ?? []).filter(own))
      monthly += lineValue(latest, line, ongoing) / periodMonths(line.date_from, line.date_to);
    if (monthly > 0) {
      addTo(byCurrency, latest.currency_code, monthly);
      payingCustomers.add(subscription.customer_id);
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}

/**
 * Service lines from paid invoices: each plan and addon line over its own period, after
 * discounts and without tax, which counts a prorated line at its full rate. Metered usage and
 * one-time charges are left out.
 */
export function chargebeeServiceLines(invoices: ChargebeeInvoice[]): ServiceLine[] {
  const lines: ServiceLine[] = [];
  for (const invoice of invoices.filter((i) => i.status === "paid"))
    for (const line of invoice.line_items ?? []) {
      if (!recurringLine(line)) continue;
      lines.push({
        start: line.date_from,
        end: line.date_to,
        currency: invoice.currency_code.toLowerCase(),
        monthly: lineValue(invoice, line, () => true) / periodMonths(line.date_from, line.date_to),
      });
    }
  return lines;
}
