// Monthly recurring revenue from Paystack. Pure functions: no I/O, fully testable.
// Definition, as for every provider: active and past-due subscriptions, their recurring charge
// normalized to a month, after ongoing discounts, before tax. A Paystack subscription carries its
// amount, and its plan the interval and currency. Active subscriptions count, and so do two
// statuses Paystack also calls active: non-renewing, cancelled but paid up until its next payment
// date, like a subscription set to cancel at the end of its period elsewhere, and attention, whose
// latest renewal failed and which Paystack charges again on the next payment date, like a past-due
// one. Completed and cancelled subscriptions do not count, nor one that starts later, which is a
// free period. The amount is the whole charge, not multiplied by `quantity`, which Paystack
// documents no way to set. Paystack records no tax, so what was charged counts.
import { unixSeconds, type ServiceLine } from "../history";
import { addTo, AVERAGE_MONTH_DAYS, intervalMonths, minorUnitsPerMajor } from "../money";

export type PaystackPlan = {
  id?: number | null;
  plan_code?: string | null;
  amount?: number | null;
  interval?: string | null;
  currency?: string | null;
  /** In the plan list only: the plan's subscriptions, which name the plan and customer by id. */
  subscriptions?: PaystackSubscription[] | null;
  total_subscriptions?: number | null;
};
export type PaystackCustomer = { id?: number | null; customer_code?: string | null };
export type PaystackSubscription = {
  subscription_code: string;
  status: string;
  amount?: number | null;
  /** When the subscription starts, in Unix seconds. */
  start?: number | null;
  plan?: PaystackPlan | number | null;
  customer?: PaystackCustomer | number | null;
};
export type PaystackTransaction = {
  id: number;
  status: string;
  /** What the customer paid, with Paystack's fees where the merchant passes them on. */
  amount: number;
  /** What the merchant asked for: less than `amount` with fees passed on, more after a partial debit. */
  requested_amount?: number | null;
  currency: string;
  paid_at?: string | null;
  paidAt?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  /** The plan a subscription's charge was for, or an empty object for any other payment. */
  plan?: PaystackPlan | string | number | null;
  plan_object?: PaystackPlan | null;
};

/**
 * Minor units from a Paystack amount. Paystack gives every amount in hundredths of the major unit,
 * XOF included, which has no minor unit in ISO 4217.
 */
export function paystackMinor(amount: number, currency: string) {
  return (amount / 100) * minorUnitsPerMajor(currency);
}

/** Months in each of Paystack's plan intervals. */
const INTERVALS = new Map<string, number>([
  ["hourly", intervalMonths("day") / 24],
  ["daily", intervalMonths("day")],
  ["weekly", intervalMonths("week")],
  ["monthly", 1],
  ["quarterly", 3],
  ["biannually", 6],
  ["annually", 12],
]);
/** Intervals Paystack bills on the same date each time, or the 28th for later dates. */
const CALENDAR = new Set(["monthly", "quarterly", "biannually", "annually"]);

export function planMonths(interval: string | null | undefined) {
  return INTERVALS.get(interval?.toLowerCase() ?? "") ?? null;
}

export const COUNTED_STATUSES = ["active", "non-renewing", "attention"] as const;

const DAY = 86_400;

/** Whether a plan was given: Paystack gives an empty object for none. */
function given(plan: unknown): plan is PaystackPlan {
  return !!plan && typeof plan === "object" && Object.keys(plan).length > 0;
}

/** Paystack's Unix times, in seconds or milliseconds, as seconds. */
function seconds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 1e11 ? Math.floor(value / 1000) : value;
}

/** Plans by code and by id, the two ways transactions name them. */
export function planIndex(plans: Iterable<PaystackPlan>) {
  const index = new Map<string, PaystackPlan>();
  for (const plan of plans) {
    if (plan.plan_code) index.set(plan.plan_code, plan);
    if (plan.id != null) index.set(String(plan.id), plan);
  }
  return index;
}

/** The plans the subscription list gives with each subscription. */
export function subscriptionPlans(subscriptions: PaystackSubscription[]) {
  return planIndex(
    subscriptions.flatMap((subscription) => (given(subscription.plan) ? [subscription.plan] : [])),
  );
}

/**
 * The subscriptions the plan list gives with each plan, with the plan in place of its id, and how
 * many more the plans say they have than they list.
 */
export function subscriptionsFromPlans(plans: PaystackPlan[]) {
  const subscriptions: PaystackSubscription[] = [];
  let unlisted = 0;
  for (const { subscriptions: listed, ...plan } of plans) {
    for (const subscription of listed ?? []) subscriptions.push({ ...subscription, plan });
    if (typeof plan.total_subscriptions === "number")
      unlisted += Math.max(0, plan.total_subscriptions - (listed?.length ?? 0));
  }
  return { subscriptions, unlisted };
}

/** What MRR may leave out when the plans list fewer subscriptions than they have, or null. */
export function unlistedNote(count: number) {
  if (!count) return null;
  return count === 1
    ? "Paystack did not list 1 subscription to your plans, so MRR may leave it out."
    : `Paystack did not list ${count} subscriptions to your plans, so MRR may leave them out.`;
}

function customerOf(subscription: PaystackSubscription) {
  const { customer } = subscription;
  if (customer && typeof customer === "object")
    return String(customer.id ?? customer.customer_code ?? subscription.subscription_code);
  return customer != null ? String(customer) : subscription.subscription_code;
}

export function paystackMrr(subscriptions: PaystackSubscription[], now: number) {
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  const seen = new Set<string>();
  for (const subscription of subscriptions) {
    if (!(COUNTED_STATUSES as readonly string[]).includes(subscription.status)) continue;
    const code = subscription.subscription_code;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    if ((seconds(subscription.start) ?? 0) > now) continue;
    const plan = given(subscription.plan) ? subscription.plan : null;
    const months = planMonths(plan?.interval);
    const amount = subscription.amount ?? plan?.amount;
    if (!plan?.currency || !months || typeof amount !== "number") {
      skippedItems++;
      continue;
    }
    subscriptionIds.push(code);
    const monthly = paystackMinor(amount, plan.currency) / months;
    if (monthly > 0) {
      addTo(byCurrency, plan.currency, monthly);
      payingCustomers.add(customerOf(subscription));
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}

/**
 * The plan a transaction paid for, as far as it carries it, and the plan's code or id; null for a
 * transaction without a plan, which was not a subscription's charge.
 */
export function transactionPlan(transaction: PaystackTransaction) {
  const own = given(transaction.plan_object)
    ? transaction.plan_object
    : given(transaction.plan)
      ? transaction.plan
      : null;
  const named =
    typeof transaction.plan === "string" || typeof transaction.plan === "number"
      ? String(transaction.plan)
      : null;
  const ref = named || own?.plan_code || (own?.id != null ? String(own.id) : null);
  return own || ref ? { own, ref } : null;
}

export function createdAt(transaction: PaystackTransaction) {
  return unixSeconds(transaction.created_at ?? transaction.createdAt);
}

/** When a transaction was paid, or created where Paystack gives no payment time. */
export function paidAt(transaction: PaystackTransaction) {
  return unixSeconds(transaction.paid_at ?? transaction.paidAt) ?? createdAt(transaction);
}

/**
 * What a transaction charged for the merchant, in Paystack's units: what was asked for, without
 * the fees passed on to the customer, or what was debited where a partial debit took less.
 */
export function charged(transaction: PaystackTransaction) {
  const asked = transaction.requested_amount;
  return typeof asked === "number" && asked > 0
    ? Math.min(asked, transaction.amount)
    : transaction.amount;
}

/** The same instant `months` calendar months later, on the month's last day where it is shorter. */
function addMonths(at: number, months: number) {
  const date = new Date(at * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const time = at * 1000 - Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  return (Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)) + time) / 1000;
}

/** The end of one interval of a plan from `start`. */
export function periodEnd(start: number, interval: string) {
  const months = planMonths(interval)!;
  if (CALENDAR.has(interval.toLowerCase())) return addMonths(start, months);
  return start + Math.round(months * AVERAGE_MONTH_DAYS * DAY);
}

/**
 * Service lines from the successful charges of plans, each over one interval of its plan from
 * when it was paid, at what was asked for without fees passed on. Paystack bills monthly and
 * longer plans on the same date each time, so those lines run to that date. A charge with a
 * refund, pending or done, is left out, since only the refunds say how much of it went back.
 */
export function paystackServiceLines(
  transactions: PaystackTransaction[],
  plans: ReadonlyMap<string, PaystackPlan>,
): ServiceLine[] {
  const lines: ServiceLine[] = [];
  const seen = new Set<number>();
  for (const transaction of transactions) {
    if (transaction.status !== "success" || seen.has(transaction.id)) continue;
    seen.add(transaction.id);
    const plan = transactionPlan(transaction);
    if (!plan) continue;
    const interval = plan.own?.interval ?? (plan.ref ? plans.get(plan.ref)?.interval : null);
    const months = planMonths(interval);
    const start = paidAt(transaction);
    if (!interval || !months || start === null) continue;
    lines.push({
      start,
      end: periodEnd(start, interval),
      currency: transaction.currency.toLowerCase(),
      monthly: paystackMinor(charged(transaction), transaction.currency) / months,
    });
  }
  return lines;
}
