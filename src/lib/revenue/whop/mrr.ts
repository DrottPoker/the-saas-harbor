// Monthly recurring revenue from Whop. Pure functions: no I/O, fully testable.
// Definition, as for every provider: active and past-due subscriptions, their recurring charge
// normalized to a month, after ongoing discounts, before tax. A Whop membership does not carry
// its price. One that has renewed is valued by its latest paid renewal on the same plan, after
// discounts and without tax. One in its first period is valued by its plan's renewal price, less
// the promo code of its first payment where that lasts beyond the first payment, and where the
// plan's price includes tax, without the tax at the share that payment shows. Plans are billed
// every so many days: 30 days count as a month and 365 as a year. Trials, paused memberships and
// one-time plans are not counted.
import { historyWindowStart, unixSeconds, type ServiceLine } from "../history";
import { addTo, AVERAGE_MONTH_DAYS, toMinorUnits } from "../money";

export type WhopMoney = { amount: string; currency: string } | null;
export type WhopMembership = {
  id: string;
  status: string;
  plan_id: string;
  user_id: string | null;
  current_period_start?: string | null;
};
export type WhopPlan = {
  id: string;
  plan_type: string;
  renewal_price: number;
  billing_period: number | null;
  currency: string;
  tax_type: string;
};
export type WhopPayment = {
  id: string;
  status: string;
  substatus?: string | null;
  billing_reason: string | null;
  membership_id: string | null;
  plan_id: string | null;
  promo_code_id: string | null;
  paid_at: string | null;
  created_at: string;
  total: WhopMoney;
  tax_amount: WhopMoney;
};
export type WhopPromo = {
  id: string;
  promo_type: string;
  amount_off: number;
  duration: string;
};

export const COUNTED_STATUSES = ["active", "past_due"] as const;
const REFUNDED = new Set(["refunded", "auto_refunded"]);
const SUBSCRIPTION_PAYMENTS = new Set([
  "subscription_create",
  "subscription_cycle",
  "subscription",
]);
const DAY = 86_400;

/** Months in a billing period of `days`: 30 days are a month and 365 a year. */
export function billingMonths(days: number) {
  if (days % 365 === 0) return (days / 365) * 12;
  if (days % 30 === 0) return days / 30;
  return days / AVERAGE_MONTH_DAYS;
}

/** A plan billed again and again, with the months between charges; null for any other. */
function recurring(plan: WhopPlan | undefined) {
  if (!plan || plan.plan_type !== "renewal" || !plan.billing_period) return null;
  return billingMonths(plan.billing_period);
}

const paid = (payment: WhopPayment) =>
  payment.status === "paid" && !REFUNDED.has(payment.substatus ?? "") && !!payment.total;

const paidAt = (payment: WhopPayment) =>
  unixSeconds(payment.paid_at) ?? unixSeconds(payment.created_at) ?? 0;

function minor(money: WhopMoney) {
  return money ? toMinorUnits(money.amount, money.currency) : 0;
}

/** A payment's amount after discounts and without tax, whether tax was added or included. */
export function untaxedAmount(payment: WhopPayment) {
  return minor(payment.total) - minor(payment.tax_amount);
}

/** Each membership's latest paid payment, and its latest paid renewal. */
function latestPayments(payments: WhopPayment[]) {
  const latest = new Map<string, WhopPayment>();
  const latestRenewal = new Map<string, WhopPayment>();
  for (const payment of payments) {
    if (!payment.membership_id || !paid(payment)) continue;
    const id = payment.membership_id;
    const seen = latest.get(id);
    if (!seen || paidAt(payment) > paidAt(seen)) latest.set(id, payment);
    if (payment.billing_reason !== "subscription_cycle") continue;
    const renewal = latestRenewal.get(id);
    if (!renewal || paidAt(payment) > paidAt(renewal)) latestRenewal.set(id, payment);
  }
  return { latest, latestRenewal };
}

/** Payments created since this instant hold each counted membership's latest paid charge. */
export function paymentWindowStart(
  memberships: WhopMembership[],
  plans: ReadonlyMap<string, WhopPlan>,
  now: Date,
) {
  let start = Math.floor(now.getTime() / 1000);
  for (const membership of memberships) {
    const months = recurring(plans.get(membership.plan_id)) ?? 12;
    const period = unixSeconds(membership.current_period_start) ?? start;
    start = Math.min(start, Math.floor(period - months * AVERAGE_MONTH_DAYS * DAY - 2 * DAY));
  }
  return Math.max(start, historyWindowStart(now));
}

/**
 * MRR from memberships that are active or past due and not paused, `paused` holding the ids of
 * those whose payment collection is paused.
 */
export function whopMrr(
  memberships: WhopMembership[],
  paused: ReadonlySet<string>,
  plans: ReadonlyMap<string, WhopPlan>,
  payments: WhopPayment[],
  promos: ReadonlyMap<string, WhopPromo>,
) {
  const { latest, latestRenewal } = latestPayments(payments);
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  const seen = new Set<string>();
  for (const membership of memberships) {
    if (!(COUNTED_STATUSES as readonly string[]).includes(membership.status)) continue;
    if (paused.has(membership.id) || seen.has(membership.id)) continue;
    seen.add(membership.id);
    const plan = plans.get(membership.plan_id);
    const months = recurring(plan);
    if (!plan || !months) continue;
    subscriptionIds.push(membership.id);
    const renewal = latestRenewal.get(membership.id);
    let charge: number;
    let currency: string;
    if (renewal && renewal.plan_id === membership.plan_id) {
      charge = untaxedAmount(renewal);
      currency = renewal.total!.currency;
    } else {
      charge = toMinorUnits(plan.renewal_price, plan.currency);
      currency = plan.currency;
      const first = latest.get(membership.id);
      const promo = first?.promo_code_id ? promos.get(first.promo_code_id) : undefined;
      if (promo && promo.duration !== "once")
        charge =
          promo.promo_type === "percentage"
            ? charge * Math.max(0, 1 - promo.amount_off)
            : Math.max(0, charge - toMinorUnits(promo.amount_off, plan.currency));
      if (plan.tax_type === "inclusive") {
        const total = first ? minor(first.total) : 0;
        if (!first || total <= 0) {
          skippedItems++;
          continue;
        }
        charge *= untaxedAmount(first) / total;
      }
    }
    const monthly = charge / months;
    if (monthly > 0) {
      addTo(byCurrency, currency, monthly);
      payingCustomers.add(membership.user_id ?? membership.id);
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}

/** The promo codes the MRR needs: those of memberships in their first period on their plan. */
export function promoCodesToRead(memberships: WhopMembership[], payments: WhopPayment[]) {
  const { latest, latestRenewal } = latestPayments(payments);
  const codes = new Set<string>();
  for (const membership of memberships) {
    if (latestRenewal.get(membership.id)?.plan_id === membership.plan_id) continue;
    const code = latest.get(membership.id)?.promo_code_id;
    if (code) codes.add(code);
  }
  return [...codes];
}

/**
 * Service lines from paid subscription payments. Whop does not say which period a payment covers,
 * so each covers one billing period of its plan from when it was paid, after discounts and without
 * tax. Payments for plan changes are left out, since their period is unknown.
 */
export function whopServiceLines(
  payments: WhopPayment[],
  plans: ReadonlyMap<string, WhopPlan>,
): ServiceLine[] {
  const lines: ServiceLine[] = [];
  for (const payment of payments) {
    if (!paid(payment) || !SUBSCRIPTION_PAYMENTS.has(payment.billing_reason ?? "")) continue;
    const plan = plans.get(payment.plan_id ?? "");
    const months = recurring(plan);
    if (!plan || !months) continue;
    const start = paidAt(payment);
    lines.push({
      start,
      end: start + plan.billing_period! * DAY,
      currency: payment.total!.currency.toLowerCase(),
      monthly: untaxedAmount(payment) / months,
    });
  }
  return lines;
}
