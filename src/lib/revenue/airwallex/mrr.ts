// Monthly recurring revenue from Airwallex Billing. Pure functions: no I/O, fully testable.
// Active subscriptions count, and unpaid ones (Airwallex's status while it retries a failed
// payment) until the period they were invoiced for ends; trials and pending subscriptions do not.
// Each item's price (flat, per unit, volume or graduated, with lots) times its quantity counts per
// its own billing period, after item discounts and then subscription discounts that last beyond
// the next charge, without tax where the price includes it. Usage-based items (metered prices and
// rate cards) are skipped, and so are subscriptions whose invoices are marked paid outside
// Airwallex, since the founder records those payments. Amounts are in major units.
import { unixSeconds, type ServiceLine } from "../history";
import { addTo, intervalMonths, periodMonths, toMinorUnits, type Interval } from "../money";

export type AirwallexPeriod = { period?: number | null; period_unit?: string | null };
export type AirwallexLot = { size?: number | null };

/** A discount applied to a subscription, a subscription item or an invoice. */
export type AirwallexDiscount = {
  id?: string;
  /** SUBSCRIPTION, SUBSCRIPTION_ITEM, INVOICE or INVOICE_LINE_ITEM. */
  applied_to?: string | null;
  /** FLAT or PERCENTAGE. */
  discount_model?: string | null;
  amount_off?: number | null;
  percentage_off?: number | null;
  currency?: string | null;
  /** ONCE, CUSTOM (for `duration`) or INDEFINITELY. */
  duration_type?: string | null;
  duration?: AirwallexPeriod | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type AirwallexTier = {
  level?: number | null;
  flat_amount?: number | null;
  unit_amount?: number | null;
  upper_bound?: number | null;
  lot?: AirwallexLot | null;
};

export type AirwallexPrice = {
  id: string;
  currency: string;
  /** FLAT, PER_UNIT, VOLUME or GRADUATED. */
  pricing_model?: string | null;
  metered?: boolean | null;
  /** ONE_OFF or RECURRING. */
  type?: string | null;
  tax_included?: boolean | null;
  recurring?: AirwallexPeriod | null;
  unit_amount?: number | null;
  flat_amount?: number | null;
  tiers?: AirwallexTier[] | null;
  lot?: AirwallexLot | null;
};

export type AirwallexSubscription = {
  id: string;
  /** PENDING, IN_TRIAL, ACTIVE, UNPAID or CANCELLED. */
  status: string;
  currency: string;
  billing_customer_id?: string | null;
  /** AUTO_CHARGE, CHARGE_ON_CHECKOUT or OUT_OF_BAND. */
  collection_method?: string | null;
  current_period_ends_at?: string | null;
  recurring?: AirwallexPeriod | null;
  applied_discounts?: AirwallexDiscount[] | null;
  default_tax_percent?: number | null;
};

export type AirwallexSubscriptionItem = {
  id: string;
  subscription_id: string;
  quantity?: number | null;
  /** Absent for an item priced by a rate card. */
  price?: AirwallexPrice | null;
  rate_card_version?: unknown;
  applied_discounts?: AirwallexDiscount[] | null;
  tax_percent?: number | null;
};

export type AirwallexInvoice = {
  id: string;
  /** DRAFT, FINALIZED or VOIDED. */
  status?: string | null;
  /** UNPAID or PAID. */
  payment_status?: string | null;
  currency: string;
  subscription_id?: string | null;
  /** After discounts, with tax. */
  total_amount?: number | null;
  total_tax_amount?: number | null;
  paid_out_of_band?: boolean | null;
};

export type AirwallexLineItem = {
  id: string;
  invoice_id: string;
  /** Before discounts and without exclusive tax. */
  amount?: number | null;
  currency?: string | null;
  discount_amounts?: { amount?: number | null }[] | null;
  tax_amount?: number | null;
  /** Inclusive. */
  period_starts_at?: string | null;
  /** Exclusive. */
  period_ends_at?: string | null;
  price?: AirwallexPrice | null;
  rate_card_item?: unknown;
};

const DAY = 86_400;

/** Unix seconds from Airwallex's time, which may give its offset without a colon (+0000). */
export function airwallexSeconds(value: string | null | undefined) {
  return unixSeconds(value?.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

const UNITS: Record<string, Interval> = { DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" };

/** Months in a billing period, or null when Airwallex gives none. */
export function recurringMonths(recurring: AirwallexPeriod | null | undefined) {
  const unit = UNITS[recurring?.period_unit ?? ""];
  if (!unit) return null;
  const count = recurring?.period ?? 1;
  return count > 0 ? intervalMonths(unit, count) : null;
}

const amount = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Billable lots of a quantity: whole lots of `size`, a part counting as a whole. */
function lots(quantity: number, lot: AirwallexLot | null | undefined) {
  const size = lot?.size;
  return size && size > 0 ? Math.ceil(quantity / size) : quantity;
}

function tierCharge(tier: AirwallexTier, quantity: number) {
  return (
    (amount(tier.flat_amount) ?? 0) + (amount(tier.unit_amount) ?? 0) * lots(quantity, tier.lot)
  );
}

/**
 * What a price charges for a quantity in one billing period, in major units, or null for a
 * pricing model that cannot be valued. A tier covers quantities up to its upper bound.
 */
export function priceCharge(price: AirwallexPrice, quantity: number): number | null {
  const tiers = [...(price.tiers ?? [])].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  switch (price.pricing_model) {
    case "FLAT":
      return amount(price.flat_amount);
    case "PER_UNIT": {
      const unit = amount(price.unit_amount);
      return unit === null ? null : unit * lots(quantity, price.lot);
    }
    case "VOLUME": {
      const tier = tiers.find((t) => t.upper_bound == null || quantity <= t.upper_bound);
      return tier ? tierCharge(tier, quantity) : null;
    }
    case "GRADUATED": {
      if (!tiers.length) return null;
      let total = 0;
      let below = 0;
      for (const tier of tiers) {
        const upper = tier.upper_bound ?? Infinity;
        const units = Math.min(quantity, upper) - below;
        if (units <= 0 && below > 0) break;
        total += tierCharge(tier, Math.max(0, units));
        below = upper;
        if (quantity <= upper) break;
      }
      return total;
    }
    default:
      return null;
  }
}

/**
 * Whether a discount applies now and to charges after the next one: for good, or for a set time
 * that has not ended. A discount for the first charge only does not count. A set time with no end
 * Airwallex gives counts, which never overstates MRR.
 */
export function ongoingDiscount(discount: AirwallexDiscount, now: number) {
  const starts = airwallexSeconds(discount.starts_at);
  if (starts !== null && starts > now) return false;
  if (discount.duration_type === "INDEFINITELY") return true;
  if (discount.duration_type !== "CUSTOM") return false;
  let ends = airwallexSeconds(discount.ends_at);
  const months = recurringMonths(discount.duration);
  if (ends === null && starts !== null && months !== null)
    ends = starts + Math.round(months * (365.25 / 12) * DAY);
  return ends === null || ends > now;
}

/**
 * An amount after the discounts on `level` that still apply, never below nothing. A discount
 * that names another level is left for that level, so none counts twice.
 */
function afterDiscounts(
  value: number,
  discounts: AirwallexDiscount[] | null | undefined,
  level: "SUBSCRIPTION" | "SUBSCRIPTION_ITEM",
  currency: string,
  now: number,
  flatScale = 1,
) {
  let result = value;
  for (const discount of discounts ?? []) {
    if (discount.applied_to && discount.applied_to !== level) continue;
    if (!ongoingDiscount(discount, now)) continue;
    if (discount.discount_model === "PERCENTAGE")
      result *= 1 - Math.min(100, Math.max(0, amount(discount.percentage_off) ?? 0)) / 100;
    else if (
      discount.discount_model === "FLAT" &&
      (!discount.currency || discount.currency.toLowerCase() === currency)
    )
      result -= (amount(discount.amount_off) ?? 0) * flatScale;
  }
  return Math.max(0, result);
}

/** Whether a subscription counts towards MRR now. */
export function countsNow(subscription: AirwallexSubscription, now: number) {
  if (subscription.status === "ACTIVE") return true;
  if (subscription.status !== "UNPAID") return false;
  const end = airwallexSeconds(subscription.current_period_ends_at);
  return end !== null && end > now;
}

/** Whether the founder records the subscription's payments, rather than Airwallex taking them. */
export const paidOutsideAirwallex = (subscription: AirwallexSubscription) =>
  subscription.collection_method === "OUT_OF_BAND";

/** An item's monthly value in major units, or null for one that cannot be valued. */
export function itemMonthly(
  item: AirwallexSubscriptionItem,
  subscription: AirwallexSubscription,
  now: number,
): number | null {
  const price = item.price;
  const currency = subscription.currency.toLowerCase();
  if (!price || item.rate_card_version || price.metered) return null;
  // A one-off price is charged on the first invoice only.
  if (price.type === "ONE_OFF") return 0;
  if (price.currency.toLowerCase() !== currency) return null;
  const months = recurringMonths(price.recurring) ?? recurringMonths(subscription.recurring);
  const charge = priceCharge(price, Math.max(0, item.quantity ?? 1));
  if (months === null || charge === null) return null;
  let value = afterDiscounts(charge, item.applied_discounts, "SUBSCRIPTION_ITEM", currency, now);
  // Tax a price includes comes off at the item's rate; without a rate it stays in.
  const rate = item.tax_percent ?? subscription.default_tax_percent;
  if (price.tax_included && rate) value /= 1 + rate / 100;
  return value / months;
}

const NO_SUBSCRIPTIONS =
  "The Airwallex account has no active subscriptions in Airwallex Billing, so MRR is zero. Revenue still counts its payments.";

/**
 * MRR per currency in minor units from the listed active and unpaid subscriptions and the items
 * of those that count. A subscription discount comes off after the item discounts, a flat one once
 * per billing period of the subscription.
 */
export function airwallexMrr(
  subscriptions: AirwallexSubscription[],
  items: ReadonlyMap<string, AirwallexSubscriptionItem[]>,
  now: number,
) {
  const byCurrency: Record<string, number> = {};
  const customers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  for (const subscription of subscriptions) {
    if (!countsNow(subscription, now)) continue;
    if (paidOutsideAirwallex(subscription)) {
      skippedItems++;
      continue;
    }
    subscriptionIds.push(subscription.id);
    const currency = subscription.currency.toLowerCase();
    let monthly = 0;
    for (const item of items.get(subscription.id) ?? []) {
      const value = itemMonthly(item, subscription, now);
      if (value === null) skippedItems++;
      else monthly += value;
    }
    const months = recurringMonths(subscription.recurring) ?? 1;
    monthly = afterDiscounts(
      monthly,
      subscription.applied_discounts,
      "SUBSCRIPTION",
      currency,
      now,
      1 / months,
    );
    if (monthly > 0) {
      addTo(byCurrency, currency, toMinorUnits(monthly, currency));
      customers.add(subscription.billing_customer_id ?? subscription.id);
    }
  }
  return {
    byCurrency,
    customers: customers.size,
    subscriptionIds,
    skippedItems,
    mrrNote: subscriptions.length ? null : NO_SUBSCRIPTIONS,
  };
}

/**
 * Invoices that paid a subscription through Airwallex: paid, not voided, and not marked paid by
 * the founder outside Airwallex.
 */
export function subscriptionInvoices(invoices: AirwallexInvoice[]) {
  return invoices.filter(
    (invoice) =>
      invoice.subscription_id &&
      invoice.payment_status === "PAID" &&
      invoice.status !== "VOIDED" &&
      !invoice.paid_out_of_band,
  );
}

/**
 * Service lines from the lines of paid subscription invoices: each recurring line that is not
 * usage-based counts its amount after discounts, without tax a price includes, over its own
 * period, so a prorated line counts at the full rate.
 */
export function airwallexServiceLines(lines: AirwallexLineItem[]): ServiceLine[] {
  return lines.flatMap((line) => {
    const price = line.price;
    if (!price || line.rate_card_item || price.metered || price.type !== "RECURRING") return [];
    const start = airwallexSeconds(line.period_starts_at);
    const end = airwallexSeconds(line.period_ends_at);
    const currency = (line.currency ?? price.currency).toLowerCase();
    if (start === null || end === null || end <= start) return [];
    const discounts = (line.discount_amounts ?? []).reduce((sum, d) => sum + (d.amount ?? 0), 0);
    const tax = price.tax_included ? (line.tax_amount ?? 0) : 0;
    const net = (amount(line.amount) ?? 0) - discounts - tax;
    if (net <= 0) return [];
    return [
      { start, end, currency, monthly: toMinorUnits(net, currency) / periodMonths(start, end) },
    ];
  });
}
