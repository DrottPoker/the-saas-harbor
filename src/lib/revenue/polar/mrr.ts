// Monthly recurring revenue from Polar. Pure functions: no I/O, fully testable.
// Definition, as for every provider: active and past-due subscriptions, their recurring charge
// normalized to a month, after ongoing discounts, before tax. A subscription's amount is its
// prices less its discount, without metered usage. A discount for the first period only is added
// back. Where prices include tax, the tax is taken out at the share the subscription's latest paid
// order shows. Trials and paused subscriptions are not counted.
import { historyWindowStart, unixSeconds, type ServiceLine } from "../history";
import { addTo, AVERAGE_MONTH_DAYS, intervalMonths, type Interval } from "../money";

export type PolarDiscount = {
  type: "fixed" | "percentage";
  duration: "once" | "forever" | "repeating";
  basis_points?: number;
  amounts?: Record<string, number> | null;
  amount?: number;
  currency?: string;
};
export type PolarPrice = { id: string; amount_type: string };
export type PolarSubscription = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  recurring_interval: Interval;
  recurring_interval_count?: number | null;
  current_period_start: string;
  customer_id: string;
  discount: PolarDiscount | null;
  prices: PolarPrice[];
};
export type PolarOrderItem = {
  amount: number;
  tax_amount: number;
  proration: boolean;
  product_price_id: string | null;
  start_timestamp?: string | null;
  end_timestamp?: string | null;
};
export type PolarOrder = {
  id: string;
  status: string;
  billing_reason: string;
  subscription_id: string | null;
  currency: string;
  subtotal_amount: number;
  discount_amount: number;
  net_amount: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  items: PolarOrderItem[];
  product: {
    recurring_interval?: Interval | null;
    recurring_interval_count?: number | null;
  } | null;
};

export const COUNTED_STATUSES = ["active", "past_due"] as const;
const PAID = new Set(["paid", "partially_refunded"]);
const SUBSCRIPTION_ORDERS = new Set([
  "subscription_create",
  "subscription_cycle",
  "subscription_update",
]);
const METERED = new Set(["metered_unit", "metered_tiers"]);
const DAY = 86_400;

const counted = (subscription: PolarSubscription) =>
  (COUNTED_STATUSES as readonly string[]).includes(subscription.status);

const subscriptionOrder = (order: PolarOrder) =>
  PAID.has(order.status) && SUBSCRIPTION_ORDERS.has(order.billing_reason);

/** The amount without a discount that only covers the first period. */
function withoutFirstPeriodDiscount(subscription: PolarSubscription) {
  const discount = subscription.discount;
  if (discount?.duration !== "once") return subscription.amount;
  if (discount.type === "percentage") {
    const share = (discount.basis_points ?? 0) / 10_000;
    return share < 1 ? subscription.amount / (1 - share) : subscription.amount;
  }
  const currency = subscription.currency.toLowerCase();
  const off =
    discount.amounts?.[currency] ??
    (discount.currency?.toLowerCase() === currency ? (discount.amount ?? 0) : 0);
  return subscription.amount + off;
}

/** Whether an order's prices included tax: then its total is the subtotal less discounts. */
function taxIncluded(order: PolarOrder) {
  return (
    order.tax_amount > 0 && order.total_amount === order.subtotal_amount - order.discount_amount
  );
}

/** Orders created since this instant hold each counted subscription's latest paid order. */
export function orderWindowStart(subscriptions: PolarSubscription[], now: Date) {
  let start = Math.floor(now.getTime() / 1000);
  for (const subscription of subscriptions.filter(counted)) {
    const period = unixSeconds(subscription.current_period_start) ?? start;
    const cycle = intervalMonths(
      subscription.recurring_interval,
      subscription.recurring_interval_count ?? 1,
    );
    start = Math.min(start, Math.floor(period - cycle * AVERAGE_MONTH_DAYS * DAY - 2 * DAY));
  }
  return Math.max(start, historyWindowStart(now));
}

/** Price ids of metered usage, which MRR and the history leave out. */
export function meteredPrices(subscriptions: PolarSubscription[]) {
  return new Set(
    subscriptions.flatMap((s) =>
      s.prices.filter((p) => METERED.has(p.amount_type)).map((p) => p.id),
    ),
  );
}

export function polarMrr(subscriptions: PolarSubscription[], orders: PolarOrder[]) {
  const latest = new Map<string, { created: number; order: PolarOrder }>();
  for (const order of orders) {
    const created = unixSeconds(order.created_at);
    if (!order.subscription_id || created === null || !subscriptionOrder(order)) continue;
    const seen = latest.get(order.subscription_id);
    if (!seen || created > seen.created) latest.set(order.subscription_id, { created, order });
  }

  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  for (const subscription of subscriptions) {
    if (!counted(subscription)) continue;
    subscriptionIds.push(subscription.id);
    let charge = withoutFirstPeriodDiscount(subscription);
    const order = latest.get(subscription.id)?.order;
    if (order && taxIncluded(order)) charge *= order.net_amount / order.total_amount;
    const monthly =
      charge /
      intervalMonths(subscription.recurring_interval, subscription.recurring_interval_count ?? 1);
    if (monthly > 0) {
      addTo(byCurrency, subscription.currency, monthly);
      payingCustomers.add(subscription.customer_id);
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems: 0 };
}

/**
 * Service lines from paid subscription orders. Each item counts over its own period, at the
 * order's share of revenue: after discounts and without tax, which a net amount over a subtotal
 * gives whether prices included tax or not. Metered usage is left out.
 */
export function polarServiceLines(orders: PolarOrder[], metered: Set<string>): ServiceLine[] {
  const lines: ServiceLine[] = [];
  for (const order of orders) {
    if (!subscriptionOrder(order) || order.subtotal_amount <= 0) continue;
    const share = order.net_amount / order.subtotal_amount;
    const interval = order.product?.recurring_interval;
    const cycle = interval
      ? intervalMonths(interval, order.product?.recurring_interval_count ?? 1)
      : null;
    for (const item of order.items) {
      if (item.product_price_id && metered.has(item.product_price_id)) continue;
      const start = unixSeconds(item.start_timestamp) ?? unixSeconds(order.created_at);
      const end =
        unixSeconds(item.end_timestamp) ??
        (start !== null && cycle ? Math.round(start + cycle * AVERAGE_MONTH_DAYS * DAY) : null);
      if (start === null || end === null || end <= start) continue;
      const months = item.proration || !cycle ? (end - start) / DAY / AVERAGE_MONTH_DAYS : cycle;
      lines.push({
        start,
        end,
        currency: order.currency.toLowerCase(),
        monthly: (item.amount * share) / months,
      });
    }
  }
  return lines;
}
