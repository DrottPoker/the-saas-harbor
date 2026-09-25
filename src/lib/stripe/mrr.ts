// Monthly recurring revenue from Stripe subscriptions. Pure functions: no I/O, fully testable.
// Definition: active and past-due subscriptions, recurring licensed items normalized to a month,
// after forever and repeating discounts, before tax. Trials, paused collection, metered usage
// and one-time discounts are excluded.

import { VerificationError } from "./errors";

export type StripeTier = {
  up_to: number | null;
  unit_amount: number | null;
  unit_amount_decimal: string | null;
  flat_amount: number | null;
  flat_amount_decimal: string | null;
};

export type StripePrice = {
  id: string;
  currency: string;
  unit_amount: number | null;
  unit_amount_decimal: string | null;
  billing_scheme: "per_unit" | "tiered";
  tiers_mode: "graduated" | "volume" | null;
  tiers?: StripeTier[];
  recurring: {
    interval: "day" | "week" | "month" | "year";
    interval_count: number;
    usage_type: "licensed" | "metered";
  } | null;
  transform_quantity: { divide_by: number; round: "up" | "down" } | null;
  /** Amounts in other currencies, present when the price is read with them expanded. */
  currency_options?: Record<
    string,
    { unit_amount: number | null; unit_amount_decimal: string | null; tiers?: StripeTier[] | null }
  >;
};

export type StripeCoupon = {
  id: string;
  amount_off: number | null;
  currency: string | null;
  percent_off: number | null;
  duration: "forever" | "once" | "repeating";
};

export type StripeDiscount = {
  id: string;
  start: number;
  end: number | null;
  source: { type: string; coupon: string | StripeCoupon | null };
};

export type StripeSubscriptionItem = {
  id: string;
  price: StripePrice;
  quantity?: number | null;
  discounts?: (string | StripeDiscount)[];
};

export type StripeSubscription = {
  id: string;
  status: string;
  customer: string | { id: string };
  currency: string;
  pause_collection: unknown;
  discounts?: (string | StripeDiscount)[];
  items: { data: StripeSubscriptionItem[]; has_more: boolean };
};

export const COUNTED_STATUSES = ["active", "past_due"] as const;

/** Days in an average month, for daily and weekly prices here and in the history alike. */
export const AVERAGE_MONTH_DAYS = 365.25 / 12;

// Minor units per major unit, per Stripe's currency list.
const ZERO_DECIMAL = new Set(
  "bif clp djf gnf jpy kmf krw mga pyg rwf ugx vnd vuv xaf xof xpf".split(" "),
);
const THREE_DECIMAL = new Set("bhd jod kwd omr tnd".split(" "));
export function minorUnitsPerMajor(currency: string) {
  const code = currency.toLowerCase();
  return ZERO_DECIMAL.has(code) ? 1 : THREE_DECIMAL.has(code) ? 1000 : 100;
}

const decimal = (exact: string | null | undefined, rounded: number | null | undefined) =>
  exact != null ? Number(exact) : (rounded ?? 0);

function quantityOf(item: StripeSubscriptionItem) {
  const quantity = item.quantity ?? 1;
  const transform = item.price.transform_quantity;
  if (!transform) return quantity;
  const divided = quantity / transform.divide_by;
  return transform.round === "up" ? Math.ceil(divided) : Math.floor(divided);
}

// Amount for one billing interval, in the price's minor units.
export function intervalAmount(price: StripePrice, quantity: number) {
  if (price.billing_scheme !== "tiered") {
    return decimal(price.unit_amount_decimal, price.unit_amount) * quantity;
  }
  if (!price.tiers?.length) throw new Error(`Tiers are missing for price ${price.id}.`);
  const tiers = price.tiers;
  const unit = (tier: StripeTier) => decimal(tier.unit_amount_decimal, tier.unit_amount);
  const flat = (tier: StripeTier) => decimal(tier.flat_amount_decimal, tier.flat_amount);
  if (price.tiers_mode === "volume") {
    const tier = tiers.find((t) => t.up_to === null || quantity <= t.up_to) ?? tiers.at(-1)!;
    return unit(tier) * quantity + flat(tier);
  }
  let total = 0;
  let previous = 0;
  for (const tier of tiers) {
    if (quantity <= previous) break;
    const upper = tier.up_to === null ? quantity : Math.min(quantity, tier.up_to);
    total += unit(tier) * (upper - previous) + flat(tier);
    previous = upper;
  }
  return total;
}

// Converts one billing interval to one month.
export function monthlyFactor(recurring: NonNullable<StripePrice["recurring"]>) {
  const perInterval = {
    day: AVERAGE_MONTH_DAYS,
    week: AVERAGE_MONTH_DAYS / 7,
    month: 1,
    year: 1 / 12,
  }[recurring.interval];
  return perInterval / recurring.interval_count;
}

function activeCoupons(
  discounts: (string | StripeDiscount)[] | undefined,
  coupons: ReadonlyMap<string, StripeCoupon>,
  now: number,
) {
  const result: StripeCoupon[] = [];
  for (const discount of discounts ?? []) {
    if (typeof discount === "string") throw new Error(`Discount ${discount} was not expanded.`);
    if (discount.start > now || (discount.end !== null && discount.end <= now)) continue;
    const source = discount.source.coupon;
    const coupon = typeof source === "string" ? coupons.get(source) : source;
    if (!coupon) {
      if (source)
        throw new Error(`Coupon ${typeof source === "string" ? source : source.id} is missing.`);
      continue;
    }
    if (coupon.duration !== "once") result.push(coupon);
  }
  return result;
}

function applyCoupons(amount: number, currency: string, factor: number, coupons: StripeCoupon[]) {
  let result = amount;
  for (const coupon of coupons) {
    if (coupon.percent_off != null) result *= 1 - coupon.percent_off / 100;
    // Amount-off coupons apply per invoice, so they are normalized like the price.
    else if (coupon.amount_off != null && coupon.currency?.toLowerCase() === currency)
      result -= coupon.amount_off * factor;
  }
  return Math.max(0, result);
}

export type MrrBreakdown = {
  /** Monthly revenue per lowercase currency code, in exact minor units. */
  byCurrency: Record<string, number>;
  /** Customers with a counted subscription worth more than zero. */
  customers: number;
  /** Every counted subscription, for duplicate-account detection. */
  subscriptionIds: string[];
  /** Metered items that could not be valued. */
  skippedItems: number;
};

export function calculateMrr(
  subscriptions: StripeSubscription[],
  coupons: ReadonlyMap<string, StripeCoupon>,
  now = Math.floor(Date.now() / 1000),
): MrrBreakdown {
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;

  for (const subscription of subscriptions) {
    if (!(COUNTED_STATUSES as readonly string[]).includes(subscription.status)) continue;
    if (subscription.pause_collection) continue;
    subscriptionIds.push(subscription.id);
    const currency = subscription.currency.toLowerCase();
    const subscriptionCoupons = activeCoupons(subscription.discounts, coupons, now);
    let total = 0;
    let factor = 1;
    for (const item of subscription.items.data) {
      const recurring = item.price.recurring;
      if (!recurring) continue;
      if (recurring.usage_type === "metered") {
        skippedItems++;
        continue;
      }
      factor = monthlyFactor(recurring);
      const amount = intervalAmount(item.price, quantityOf(item)) * factor;
      total += applyCoupons(amount, currency, factor, activeCoupons(item.discounts, coupons, now));
    }
    total = applyCoupons(total, currency, factor, subscriptionCoupons);
    if (total > 0) {
      byCurrency[currency] = (byCurrency[currency] ?? 0) + total;
      const customer = subscription.customer;
      payingCustomers.add(typeof customer === "string" ? customer : customer.id);
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}

/**
 * Converts per-currency MRR to whole USD cents. `rates` maps a lowercase currency code to units
 * of that currency per 1 USD, which is the shape the exchange-rate source returns for base USD.
 */
export function toUsdCents(byCurrency: Record<string, number>, rates: ReadonlyMap<string, number>) {
  let usd = 0;
  for (const [currency, minor] of Object.entries(byCurrency)) {
    const rate = currency === "usd" ? 1 : rates.get(currency);
    if (!rate) throw new VerificationError(`No exchange rate for ${currency.toUpperCase()}.`);
    usd += minor / minorUnitsPerMajor(currency) / rate;
  }
  return Math.round(usd * 100);
}
