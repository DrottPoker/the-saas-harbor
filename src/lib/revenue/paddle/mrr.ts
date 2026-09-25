// Monthly recurring revenue from Paddle Billing. Pure functions: no I/O, fully testable.
// Definition, as for every provider: active and past-due subscriptions, their recurring charge
// normalized to a month, after ongoing discounts, before tax. Paddle converts currencies,
// applies local prices and adds or includes tax when it bills, so each subscription is valued by
// its latest paid charge for a full billing period: the line totals less tax, and without a
// discount that has ended since. Trials and paused subscriptions are not counted, and one-off
// charges never are.
import { historyWindowStart, unixSeconds, type ServiceLine } from "../history";
import { addTo, AVERAGE_MONTH_DAYS, intervalMonths, type Interval } from "../money";

export type PaddleCycle = { interval: Interval; frequency: number };
export type PaddlePeriod = { starts_at: string; ends_at: string };
export type PaddlePrice = {
  id: string;
  billing_cycle: PaddleCycle | null;
  unit_price: { amount: string; currency_code: string };
};
export type PaddleSubscription = {
  id: string;
  status: string;
  customer_id: string;
  currency_code: string;
  billing_cycle: PaddleCycle;
  current_billing_period: PaddlePeriod | null;
  discount: {
    id: string;
    starts_at: string | null;
    ends_at: string | null;
    type?: "recurring" | "one-off";
  } | null;
};
export type PaddleTotals = { subtotal: string; discount: string; tax: string; total: string };
export type PaddleLineItem = {
  price_id: string | null;
  proration: { rate: string; billing_period: PaddlePeriod } | null;
  totals: PaddleTotals;
};
export type PaddleTransaction = {
  id: string;
  status: string;
  subscription_id: string | null;
  currency_code: string;
  billed_at: string | null;
  billing_period: PaddlePeriod | null;
  items: { price: PaddlePrice | null }[];
  details: { line_items: PaddleLineItem[] };
};

export const COUNTED_STATUSES = ["active", "past_due"] as const;
const DAY = 86_400;

// Paddle writes amounts as strings of the currency's smallest unit.
const amount = (value: string | undefined) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

/** What a line earned: after the discounts billed, without tax. */
const net = (totals: PaddleTotals) => amount(totals.total) - amount(totals.tax);

/** The same line without its discount, for a discount that has ended since. */
function undiscounted(totals: PaddleTotals) {
  const subtotal = amount(totals.subtotal);
  const discount = amount(totals.discount);
  return discount > 0 && subtotal > discount
    ? (net(totals) * subtotal) / (subtotal - discount)
    : net(totals);
}

function discountApplies(subscription: PaddleSubscription, now: number) {
  const discount = subscription.discount;
  if (!discount || discount.type === "one-off") return false;
  const ends = unixSeconds(discount.ends_at);
  return ends === null || ends > now;
}

function recurringPrices(transaction: PaddleTransaction) {
  const prices = new Map<string, PaddlePrice & { billing_cycle: PaddleCycle }>();
  for (const { price } of transaction.items)
    if (price?.billing_cycle)
      prices.set(price.id, { ...price, billing_cycle: price.billing_cycle });
  return prices;
}

/** The lines of a transaction that charge a recurring price for a whole billing period. */
function fullPeriodLines(transaction: PaddleTransaction) {
  const prices = recurringPrices(transaction);
  return transaction.details.line_items.filter(
    (line) =>
      line.price_id !== null &&
      prices.has(line.price_id) &&
      (line.proration === null || amount(line.proration.rate) === 1),
  );
}

const counted = (subscription: PaddleSubscription) =>
  (COUNTED_STATUSES as readonly string[]).includes(subscription.status);

/**
 * Transactions billed since this instant hold every counted subscription's latest full charge:
 * the period before the current one, which a past-due subscription has not paid yet.
 */
export function transactionWindowStart(subscriptions: PaddleSubscription[], now: Date) {
  let start = Math.floor(now.getTime() / 1000);
  for (const subscription of subscriptions.filter(counted)) {
    const period = unixSeconds(subscription.current_billing_period?.starts_at) ?? start;
    const cycle = subscription.billing_cycle;
    const back = intervalMonths(cycle.interval, cycle.frequency) * AVERAGE_MONTH_DAYS * DAY;
    start = Math.min(start, Math.floor(period - back - 2 * DAY));
  }
  return Math.max(start, historyWindowStart(now));
}

export function paddleMrr(
  subscriptions: PaddleSubscription[],
  transactions: PaddleTransaction[],
  now: number,
) {
  const latest = new Map<string, { billed: number; transaction: PaddleTransaction }>();
  for (const transaction of transactions) {
    const billed = unixSeconds(transaction.billed_at);
    if (!transaction.subscription_id || billed === null) continue;
    if (!fullPeriodLines(transaction).length) continue;
    const seen = latest.get(transaction.subscription_id);
    if (!seen || billed > seen.billed)
      latest.set(transaction.subscription_id, { billed, transaction });
  }

  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  for (const subscription of subscriptions) {
    if (!counted(subscription)) continue;
    subscriptionIds.push(subscription.id);
    const found = latest.get(subscription.id)?.transaction;
    // A subscription without a paid charge to value it by, such as one imported into Paddle.
    if (!found) {
      skippedItems++;
      continue;
    }
    const discounted = discountApplies(subscription, now);
    const charge = fullPeriodLines(found).reduce(
      (sum, line) => sum + (discounted ? net(line.totals) : undiscounted(line.totals)),
      0,
    );
    const cycle = subscription.billing_cycle;
    const monthly = charge / intervalMonths(cycle.interval, cycle.frequency);
    if (monthly > 0) {
      addTo(byCurrency, found.currency_code, monthly);
      payingCustomers.add(subscription.customer_id);
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}

/**
 * Service lines from paid transactions: every recurring line counts its amount after discounts
 * and without tax over its period. A proration covers its share of the billing period, so it
 * counts at the full period's monthly rate.
 */
export function paddleServiceLines(transactions: PaddleTransaction[]): ServiceLine[] {
  const lines: ServiceLine[] = [];
  for (const transaction of transactions) {
    if (!transaction.subscription_id) continue;
    const prices = recurringPrices(transaction);
    for (const line of transaction.details.line_items) {
      const price = line.price_id ? prices.get(line.price_id) : undefined;
      if (!price) continue;
      const period = line.proration?.billing_period ?? transaction.billing_period;
      const start = unixSeconds(period?.starts_at);
      const end = unixSeconds(period?.ends_at);
      const rate = line.proration ? amount(line.proration.rate) : 1;
      if (start === null || end === null || end <= start || rate <= 0) continue;
      const cycle = price.billing_cycle;
      lines.push({
        start,
        end,
        currency: transaction.currency_code.toLowerCase(),
        monthly: net(line.totals) / (intervalMonths(cycle.interval, cycle.frequency) * rate),
      });
    }
  }
  return lines;
}
