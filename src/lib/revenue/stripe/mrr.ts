// Monthly recurring revenue from Stripe subscriptions. Pure functions: no I/O, fully testable.
// Definition: active and past-due subscriptions, recurring licensed items normalized to a month,
// after forever and repeating discounts, before tax. Trials, paused collection, metered usage
// and one-time discounts are excluded. A price that includes tax is taken without it, at the share
// the subscription's latest invoice shows.

import { addTo, intervalMonths } from "../money";
import type { StripeInvoiceLine } from "./history";

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
  /** Whether the amount includes tax, for prices used with Stripe Tax. */
  tax_behavior?: "inclusive" | "exclusive" | "unspecified" | null;
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

/** A tax rate set by hand, which may be included in the price it is charged on. */
export type StripeTaxRate = { inclusive: boolean };

export type StripeSubscriptionItem = {
  id: string;
  price: StripePrice;
  quantity?: number | null;
  discounts?: (string | StripeDiscount)[];
  tax_rates?: StripeTaxRate[] | null;
};

export type StripeSubscription = {
  id: string;
  status: string;
  customer: string | { id: string };
  currency: string;
  pause_collection: unknown;
  discounts?: (string | StripeDiscount)[];
  items: { data: StripeSubscriptionItem[]; has_more: boolean };
  default_tax_rates?: StripeTaxRate[] | null;
  latest_invoice?: string | { id: string } | null;
};

/** Whether a subscription's prices include tax: through Stripe Tax or a tax rate set by hand. */
export function includesTax(subscription: StripeSubscription) {
  return (
    !!subscription.default_tax_rates?.some((rate) => rate.inclusive) ||
    subscription.items.data.some(
      (item) =>
        item.price.tax_behavior === "inclusive" || !!item.tax_rates?.some((rate) => rate.inclusive),
    )
  );
}

/**
 * The share of a tax-inclusive charge that is not tax, from an invoice's lines: what the lines
 * charged less the tax they included, over what they charged. 1 when nothing included tax.
 */
export function untaxedShare(lines: Pick<StripeInvoiceLine, "amount" | "taxes">[]) {
  let charged = 0;
  let tax = 0;
  for (const line of lines) {
    const included = (line.taxes ?? []).filter((t) => t.tax_behavior === "inclusive");
    if (!included.length) continue;
    charged += line.amount;
    tax += included.reduce((sum, t) => sum + t.amount, 0);
  }
  return charged > 0 ? Math.max(0, charged - tax) / charged : 1;
}

export const COUNTED_STATUSES = ["active", "past_due"] as const;

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
  return 1 / intervalMonths(recurring.interval, recurring.interval_count);
}

/** The coupons of discounts in effect, or null when one is a deleted coupon that cannot be read. */
function activeCoupons(
  discounts: (string | StripeDiscount)[] | undefined,
  coupons: ReadonlyMap<string, StripeCoupon>,
  deleted: ReadonlySet<string>,
  now: number,
) {
  const result: StripeCoupon[] = [];
  for (const discount of discounts ?? []) {
    if (typeof discount === "string") throw new Error(`Discount ${discount} was not expanded.`);
    if (discount.start > now || (discount.end !== null && discount.end <= now)) continue;
    const source = discount.source.coupon;
    if (typeof source === "string" && deleted.has(source)) return null;
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
  /** Subscriptions left out because a coupon they still have was deleted and cannot be read. */
  deletedCoupons: number;
  /** Tax-inclusive subscriptions counted with their tax, as no invoice gave its share. */
  taxIncluded: number;
};

export function calculateMrr(
  subscriptions: StripeSubscription[],
  coupons: ReadonlyMap<string, StripeCoupon>,
  now = Math.floor(Date.now() / 1000),
  {
    untaxed = new Map(),
    deleted = new Set(),
  }: {
    /** The untaxed share of each tax-inclusive subscription, by its id. */
    untaxed?: ReadonlyMap<string, number>;
    /** Coupons that were deleted, which Stripe no longer returns. */
    deleted?: ReadonlySet<string>;
  } = {},
): MrrBreakdown {
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  let deletedCoupons = 0;
  let taxIncluded = 0;

  for (const subscription of subscriptions) {
    if (!(COUNTED_STATUSES as readonly string[]).includes(subscription.status)) continue;
    if (subscription.pause_collection) continue;
    subscriptionIds.push(subscription.id);
    const currency = subscription.currency.toLowerCase();
    const subscriptionCoupons = activeCoupons(subscription.discounts, coupons, deleted, now);
    const itemCoupons = subscription.items.data.map((item) =>
      activeCoupons(item.discounts, coupons, deleted, now),
    );
    // A deleted coupon still discounts the subscription, by terms that can no longer be read.
    if (!subscriptionCoupons || itemCoupons.some((found) => !found)) {
      deletedCoupons++;
      continue;
    }
    let total = 0;
    let factor = 1;
    subscription.items.data.forEach((item, index) => {
      const recurring = item.price.recurring;
      if (!recurring) return;
      if (recurring.usage_type === "metered") {
        skippedItems++;
        return;
      }
      factor = monthlyFactor(recurring);
      const amount = intervalAmount(item.price, quantityOf(item)) * factor;
      total += applyCoupons(amount, currency, factor, itemCoupons[index]!);
    });
    total = applyCoupons(total, currency, factor, subscriptionCoupons);
    // Discounts apply to a tax-inclusive price, so its tax is taken out of what is left.
    if (includesTax(subscription)) {
      const share = untaxed.get(subscription.id);
      if (share === undefined) taxIncluded++;
      else total *= share;
    }
    if (total > 0) {
      addTo(byCurrency, currency, total);
      const customer = subscription.customer;
      payingCustomers.add(typeof customer === "string" ? customer : customer.id);
    }
  }
  return {
    byCurrency,
    customers: payingCustomers.size,
    subscriptionIds,
    skippedItems,
    deletedCoupons,
    taxIncluded,
  };
}
