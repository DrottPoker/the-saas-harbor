// Monthly recurring revenue from Gumroad. Pure functions: no I/O, fully testable.
// Gumroad calls the subscriptions to its membership products subscribers, and does not show what
// a subscriber pays, so each is valued by its latest sale. A sale gives its price in US cents
// after discounts and without the tax Gumroad collects, and the period it pays for. Free trials
// are not counted, nor installment plans, which pay for a product that is not a membership, nor
// sales for an upgrade, which cover part of a period.
import { unixSeconds, type ServiceLine } from "../history";
import { addTo } from "../money";

export type GumroadProduct = {
  id: string;
  is_tiered_membership?: boolean | null;
  subscription_duration?: string | null;
};
export type GumroadSubscriber = {
  id: string;
  product_id: string;
  user_id?: string | null;
  email?: string | null;
  status: string;
  recurrence?: string | null;
  free_trial_ends_at?: string | null;
};
export type GumroadSale = {
  id: string;
  created_at: string;
  /** US cents, after discounts and without the tax Gumroad collects. */
  price: number;
  subscription_id?: string | null;
  /** The period the sale pays for, such as monthly. */
  subscription_duration?: string | null;
  is_upgrade_purchase?: boolean | null;
  refunded?: boolean | null;
};

/** Alive, set to cancel at the end of the period, or with a failed payment being retried. */
export const COUNTED_STATUSES = ["alive", "pending_cancellation", "pending_failure"] as const;

const MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  biannually: 6,
  yearly: 12,
  every_two_years: 24,
};

/** Months in one of Gumroad's billing periods, or null for one it does not bill by. */
export function recurrenceMonths(recurrence: string | null | undefined) {
  return (recurrence && MONTHS[recurrence]) || null;
}

/** A membership product, or an older subscription product. */
export function isMembership(product: GumroadProduct) {
  return !!product.is_tiered_membership || !!product.subscription_duration;
}

/** The subscribers counted: active, and past any free trial. */
export function countedSubscribers(subscribers: GumroadSubscriber[], now: number) {
  return subscribers.filter(
    (subscriber) =>
      (COUNTED_STATUSES as readonly string[]).includes(subscriber.status) &&
      (unixSeconds(subscriber.free_trial_ends_at) ?? 0) <= now,
  );
}

/**
 * Sales from this day on hold every counted subscriber's latest charge: one billing period of the
 * longest a subscriber pays for, and a month more for a payment being retried.
 */
export function salesWindowStart(subscribers: GumroadSubscriber[], now: Date) {
  const months = Math.max(1, ...subscribers.map((s) => recurrenceMonths(s.recurrence) ?? 1)) + 1;
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()) / 1000,
  );
}

/** Whether a sale charged for a whole billing period of a subscription. */
export function isPeriodCharge(sale: GumroadSale) {
  return !!sale.subscription_id && !sale.is_upgrade_purchase;
}

/** Each subscription's latest charge for a whole period. */
export function latestCharges(sales: GumroadSale[]) {
  const latest = new Map<string, GumroadSale>();
  for (const sale of sales) {
    if (!isPeriodCharge(sale)) continue;
    const seen = latest.get(sale.subscription_id!);
    if (!seen || (unixSeconds(sale.created_at) ?? 0) > (unixSeconds(seen.created_at) ?? 0))
      latest.set(sale.subscription_id!, sale);
  }
  return latest;
}

export function gumroadMrr(
  subscribers: GumroadSubscriber[],
  latest: ReadonlyMap<string, GumroadSale>,
) {
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  for (const subscriber of subscribers) {
    subscriptionIds.push(subscriber.id);
    const sale = latest.get(subscriber.id);
    const months = recurrenceMonths(sale?.subscription_duration ?? subscriber.recurrence);
    // A subscriber without a charge to value it by, such as one whose last payment was long ago.
    if (!sale || !months) {
      skippedItems++;
      continue;
    }
    const monthly = sale.price / months;
    if (monthly > 0) {
      addTo(byCurrency, "usd", monthly);
      payingCustomers.add(subscriber.user_id ?? subscriber.email ?? subscriber.id);
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}

/**
 * Service lines from the sales of subscriptions: each charge for a whole period counts its price
 * over the period it pays for, from when it was made. Charges refunded in full do not count.
 */
export function gumroadServiceLines(sales: GumroadSale[]): ServiceLine[] {
  return sales.flatMap((sale) => {
    const start = unixSeconds(sale.created_at);
    const months = recurrenceMonths(sale.subscription_duration);
    if (!isPeriodCharge(sale) || sale.refunded || start === null || !months) return [];
    const date = new Date(start * 1000);
    const end =
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + months,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
      ) / 1000;
    return [{ start, end, currency: "usd", monthly: sale.price / months }];
  });
}
