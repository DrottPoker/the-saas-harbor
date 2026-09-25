// Monthly recurring revenue from Dodo Payments. Pure functions: no I/O, fully testable.
// Definition, as for every provider: active and past-due subscriptions, their recurring charge
// normalized to a month, after ongoing discounts, before tax. Dodo gives each subscription the
// amount it charges every period. Where that amount includes tax, the tax is taken out at the
// share the subscription's latest successful payment shows. Trials, on-demand subscriptions,
// which have no fixed charge, and subscriptions on hold or paused are not counted.
import { unixSeconds } from "../history";
import { addTo, intervalMonths, type Interval } from "../money";

export type DodoSubscription = {
  subscription_id: string;
  status: string;
  customer: { customer_id: string };
  recurring_pre_tax_amount: number;
  currency: string;
  tax_inclusive: boolean;
  payment_frequency_interval: "Day" | "Week" | "Month" | "Year";
  payment_frequency_count: number;
  trial_period_days: number;
  created_at: string;
  on_demand: boolean;
};
export type DodoPayment = { payment_id: string; total_amount: number; tax?: number | null };

export const COUNTED_STATUSES = ["active", "past_due"] as const;
const DAY = 86_400;

function counted(subscription: DodoSubscription, now: number) {
  if (!(COUNTED_STATUSES as readonly string[]).includes(subscription.status)) return false;
  if (subscription.on_demand) return false;
  const created = unixSeconds(subscription.created_at) ?? 0;
  return created + subscription.trial_period_days * DAY <= now;
}

/** Counted subscriptions whose amount includes tax, which need a payment to take it out. */
export function taxIncludedSubscriptions(subscriptions: DodoSubscription[], now: number) {
  return subscriptions
    .filter((subscription) => counted(subscription, now) && subscription.tax_inclusive)
    .map((subscription) => subscription.subscription_id);
}

/** The share of a payment that is not tax. */
export function untaxedShare(payment: DodoPayment) {
  return payment.total_amount > 0
    ? (payment.total_amount - (payment.tax ?? 0)) / payment.total_amount
    : 1;
}

/**
 * MRR from the subscriptions. `untaxed` maps a tax-inclusive subscription to the share of its
 * latest payment that is not tax; one without a payment to read is not counted.
 */
export function dodoMrr(
  subscriptions: DodoSubscription[],
  untaxed: ReadonlyMap<string, number>,
  now: number,
) {
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  const seen = new Set<string>();
  for (const subscription of subscriptions) {
    if (seen.has(subscription.subscription_id) || !counted(subscription, now)) continue;
    seen.add(subscription.subscription_id);
    subscriptionIds.push(subscription.subscription_id);
    let charge = subscription.recurring_pre_tax_amount;
    if (subscription.tax_inclusive) {
      const share = untaxed.get(subscription.subscription_id);
      if (share === undefined) {
        skippedItems++;
        continue;
      }
      charge *= share;
    }
    const interval = subscription.payment_frequency_interval.toLowerCase() as Interval;
    const monthly = charge / intervalMonths(interval, subscription.payment_frequency_count);
    if (monthly > 0) {
      addTo(byCurrency, subscription.currency, monthly);
      payingCustomers.add(subscription.customer.customer_id);
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}
