// Monthly recurring revenue from Creem. Pure functions: no I/O, fully testable.
// Definition, as for every provider: active and past-due subscriptions, their recurring charge
// normalized to a month, after ongoing discounts, before tax. A Creem subscription does not carry
// its price, so it is valued by its product's price times its units, less a discount that lasts
// beyond the first period. Where the product's price includes tax, the tax is taken out at the
// share the subscription's latest paid transaction shows; one without a transaction to read is not
// counted. Metered usage is not part of the price. Trials, paused and unpaid subscriptions are not
// counted; one set to cancel at the end of its period still is.
import type { ServiceLine } from "../history";
import { addTo, intervalMonths, periodMonths, type Interval } from "../money";

export type CreemProduct = {
  id: string;
  price: number;
  currency: string;
  billing_type: string;
  billing_period?: string | null;
  recurring_interval?: string | null;
  recurring_interval_count?: number | null;
  tax_mode: string;
  usage_prices?: unknown[] | null;
};
export type CreemTransaction = {
  id: string;
  amount: number;
  amount_paid?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  currency: string;
  type: string;
  status: string;
  subscription?: string | null;
  period_start?: number | null;
  period_end?: number | null;
  created_at: number;
};
export type CreemDiscount = {
  type: string;
  amount?: number | null;
  percentage?: number | null;
  duration: string;
};
export type CreemSubscription = {
  id: string;
  status: string;
  product: CreemProduct | string;
  customer: { id: string } | string;
  items?: { product_id?: string | null; units?: number | null }[] | null;
  discount?: CreemDiscount | null;
  last_transaction?: CreemTransaction | null;
};

export const COUNTED_STATUSES = ["active", "past_due", "scheduled_cancel"] as const;
const PAID = new Set(["paid", "partialRefund"]);
const PERIODS: Record<string, [Interval, number]> = {
  "every-day": ["day", 1],
  "every-month": ["month", 1],
  "every-three-months": ["month", 3],
  "every-six-months": ["month", 6],
  "every-year": ["year", 1],
};
const INTERVALS = new Set<string>(["day", "week", "month", "year"]);

const counted = (subscription: CreemSubscription) =>
  (COUNTED_STATUSES as readonly string[]).includes(subscription.status);

/** Months in a product's billing cycle, or null for one-time products and unreadable periods. */
export function cycleMonths(product: CreemProduct) {
  if (product.billing_type !== "recurring") return null;
  const interval = product.recurring_interval;
  if (interval && INTERVALS.has(interval))
    return intervalMonths(interval as Interval, product.recurring_interval_count ?? 1);
  const period = PERIODS[product.billing_period ?? ""];
  return period ? intervalMonths(...period) : null;
}

/** Creem's timestamps, in seconds or milliseconds, as seconds. */
function unix(value: number | null | undefined) {
  if (!value) return null;
  return value > 1e11 ? Math.floor(value / 1000) : value;
}

/** A transaction's amount after discounts and without tax. */
export function untaxedAmount(transaction: CreemTransaction) {
  const tax = transaction.tax_amount ?? 0;
  if (transaction.amount_paid != null) return transaction.amount_paid - tax;
  return transaction.amount - (transaction.discount_amount ?? 0);
}

const subscriptionCharge = (transaction: CreemTransaction) =>
  transaction.type === "invoice" && PAID.has(transaction.status) && !!transaction.subscription;

export function productOf(
  subscription: CreemSubscription,
  products: ReadonlyMap<string, CreemProduct>,
) {
  const { product } = subscription;
  return typeof product === "string" ? (products.get(product) ?? null) : product;
}

/** Each subscription's latest paid transaction, from its own record and the transactions read. */
function latestPaid(subscriptions: CreemSubscription[], transactions: CreemTransaction[]) {
  const latest = new Map<string, CreemTransaction>();
  const consider = (transaction: CreemTransaction | null | undefined) => {
    if (!transaction || !subscriptionCharge(transaction)) return;
    const id = transaction.subscription!;
    const seen = latest.get(id);
    if (!seen || (unix(transaction.created_at) ?? 0) > (unix(seen.created_at) ?? 0))
      latest.set(id, transaction);
  };
  for (const subscription of subscriptions)
    consider(
      subscription.last_transaction && {
        ...subscription.last_transaction,
        subscription: subscription.last_transaction.subscription ?? subscription.id,
      },
    );
  transactions.forEach(consider);
  return latest;
}

/** The price after a discount that lasts beyond the first period. */
function discounted(amount: number, discount: CreemDiscount | null | undefined) {
  if (!discount || discount.duration === "once") return amount;
  if (discount.type === "percentage") {
    const percent = discount.percentage ?? discount.amount ?? 0;
    return amount * Math.max(0, 1 - percent / 100);
  }
  return Math.max(0, amount - (discount.amount ?? 0));
}

function units(subscription: CreemSubscription, product: CreemProduct) {
  const items = (subscription.items ?? []).filter(
    (item) => !item.product_id || item.product_id === product.id,
  );
  return items.length ? items.reduce((sum, item) => sum + (item.units ?? 1), 0) : 1;
}

export function creemMrr(
  subscriptions: CreemSubscription[],
  products: ReadonlyMap<string, CreemProduct>,
  transactions: CreemTransaction[] = [],
) {
  const latest = latestPaid(subscriptions, transactions);
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  for (const subscription of subscriptions) {
    if (!counted(subscription)) continue;
    const product = productOf(subscription, products);
    const cycle = product && cycleMonths(product);
    if (!product || !cycle) {
      skippedItems++;
      continue;
    }
    subscriptionIds.push(subscription.id);
    let charge = discounted(product.price * units(subscription, product), subscription.discount);
    if (product.tax_mode === "inclusive") {
      const transaction = latest.get(subscription.id);
      const paid = transaction?.amount_paid;
      if (!transaction || !paid) {
        skippedItems++;
        continue;
      }
      charge *= untaxedAmount(transaction) / paid;
    }
    const monthly = charge / cycle;
    if (monthly > 0) {
      addTo(byCurrency, product.currency, monthly);
      const customer = subscription.customer;
      payingCustomers.add(typeof customer === "string" ? customer : customer.id);
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}

/**
 * Service lines from paid subscription transactions, each over the period it covers, after
 * discounts and without tax. Subscriptions to products with metered usage are left out, since
 * their charges hold usage that cannot be told apart from the price.
 */
export function creemServiceLines(
  transactions: CreemTransaction[],
  subscriptions: CreemSubscription[],
  products: ReadonlyMap<string, CreemProduct>,
): ServiceLine[] {
  const metered = new Set(
    subscriptions
      .filter((subscription) => productOf(subscription, products)?.usage_prices?.length)
      .map((subscription) => subscription.id),
  );
  const lines: ServiceLine[] = [];
  for (const transaction of transactions) {
    if (!subscriptionCharge(transaction) || metered.has(transaction.subscription!)) continue;
    const start = unix(transaction.period_start);
    const end = unix(transaction.period_end);
    if (start === null || end === null || end <= start) continue;
    lines.push({
      start,
      end,
      currency: transaction.currency.toLowerCase(),
      monthly: untaxedAmount(transaction) / periodMonths(start, end),
    });
  }
  return lines;
}
