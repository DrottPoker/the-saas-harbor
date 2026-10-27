// Monthly recurring revenue from Zoho Billing. Pure functions: no I/O, fully testable.
// Counted: live subscriptions, non-renewing ones (cancelled at the end of the term they paid for)
// and those in dunning (a renewal payment failed and is being retried), as past-due subscriptions
// count for every provider. Not counted: trials, future subscriptions, unpaid ones (dunning ended
// without payment), cancelled and expired ones. Each subscription's `amount` is what Zoho charges
// it every billing interval, which the list gives without a breakdown of tax or coupons; only a
// request per subscription shows them, which Zoho's limit of 1,000 API calls a day on its Standard
// plan does not allow every hour. So MRR counts what is charged, tax included where the price
// includes or adds it, after the discount Zoho applies to that charge. Zoho bills every so many
// weeks, months or years.
import { addTo, intervalMonths, toMinorUnits } from "../money";

export type ZohoSubscription = {
  subscription_id: string | number;
  status: string;
  /** What is charged every interval, in major units. */
  amount?: number | string | null;
  interval?: number | string | null;
  interval_unit?: string | null;
  currency_code?: string | null;
  customer_id?: string | number | null;
};

export const COUNTED_STATUSES = new Set(["live", "non_renewing", "dunning"]);

/** The list filters that hold the counted statuses: live, non-renewing and past due (dunning). */
export const SUBSCRIPTION_FILTERS = [
  "SubscriptionStatus.LIVE",
  "SubscriptionStatus.NON_RENEWING",
  "SubscriptionStatus.PAST_DUE",
];

/** An amount in major units, which Zoho gives as a number or a string, or null without one. */
export function majorAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

/** Months in a subscription's billing interval, or null when it cannot be read. */
export function billingMonths(subscription: ZohoSubscription) {
  const count = Number(subscription.interval ?? 1);
  if (!Number.isFinite(count) || count <= 0) return null;
  switch (subscription.interval_unit?.toLowerCase()) {
    case "weeks":
    case "week":
      return intervalMonths("week", count);
    case "months":
    case "month":
      return intervalMonths("month", count);
    case "years":
    case "year":
      return intervalMonths("year", count);
    default:
      return null;
  }
}

export function zohoMrr(subscriptions: ZohoSubscription[]) {
  const byCurrency: Record<string, number> = {};
  const customers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  const seen = new Set<string>();
  for (const subscription of subscriptions) {
    const id = String(subscription.subscription_id ?? "");
    if (!id || seen.has(id) || !COUNTED_STATUSES.has(subscription.status)) continue;
    seen.add(id);
    subscriptionIds.push(id);
    const months = billingMonths(subscription);
    const amount = majorAmount(subscription.amount);
    const currency = subscription.currency_code;
    if (months === null || amount === null || !currency) {
      skippedItems++;
      continue;
    }
    const monthly = toMinorUnits(amount, currency) / months;
    if (monthly > 0) {
      addTo(byCurrency, currency, monthly);
      customers.add(String(subscription.customer_id ?? id));
    }
  }
  return { byCurrency, customers: customers.size, subscriptionIds, skippedItems };
}
