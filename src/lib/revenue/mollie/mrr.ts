// Monthly recurring revenue from Mollie. Pure functions: no I/O, fully testable.
// Definition, as for every provider: active and past-due subscriptions, their recurring charge
// normalized to a month, after ongoing discounts, before tax. A Mollie subscription charges a set
// amount every so many days, weeks or months, and has no discounts. Mollie keeps a subscription
// active while it retries a failed payment, so past-due ones count. Its amount carries no tax, so
// it counts as charged. A subscription that starts later is in a trial, unless its customer paid for
// the time before it: Mollie's guide has a first payment, which sets up the mandate, pay for the
// first period, and the subscription start after it. A paid first payment of the customer for at
// least the subscription's amount, made within an interval and a week before it starts, therefore
// counts it from then on; a smaller one, such as a payment of nothing that only sets up the
// mandate, leaves it a trial. Pending, suspended, canceled and completed subscriptions are not
// counted. Amounts are strings in major units, so `toMinorUnits` reads them as `money.ts` counts
// minor units, whatever decimals Mollie uses for a currency.
import { unixSeconds, type ServiceLine } from "../history";
import { addTo, intervalMonths, toMinorUnits } from "../money";
import { dayStart, netOf } from "../payments";

export type MollieAmount = { currency: string; value: string };

export type MollieSubscription = {
  id: string;
  status: string;
  amount: MollieAmount;
  /** Such as "1 month", "14 days" or "2 weeks"; at most a year. */
  interval: string;
  /** The day of the first charge, as YYYY-MM-DD. */
  startDate?: string | null;
  customerId: string;
};

/** A line of a payment created with lines, where Mollie gives the VAT it includes. */
export type MolliePaymentLine = { vatAmount?: MollieAmount | null };

export type MolliePayment = {
  id: string;
  status: string;
  createdAt: string;
  amount: MollieAmount;
  amountRefunded?: MollieAmount | null;
  /** Given only when not zero. */
  amountChargedBack?: MollieAmount | null;
  /** oneoff, first (sets up a mandate) or recurring (charges one). */
  sequenceType?: string | null;
  customerId?: string | null;
  /** The subscription that created the payment. */
  subscriptionId?: string | null;
  lines?: MolliePaymentLine[] | null;
};

export type MollieInterval = { unit: "day" | "week" | "month"; count: number };

export const COUNTED_STATUS = "active";
const DAY = 86_400;
/** How much earlier than an interval before the start a first payment may still pay ahead. */
const GRACE = 7 * DAY;

/** An interval such as "1 month", "14 days" or "2 weeks"; null when it cannot be read. */
export function parseInterval(value: string | null | undefined): MollieInterval | null {
  const match = /^\s*(\d+)\s+(day|week|month)s?\s*$/i.exec(value ?? "");
  const count = Number(match?.[1]);
  if (!match || !count) return null;
  return { unit: match[2].toLowerCase() as MollieInterval["unit"], count };
}

const months = (interval: MollieInterval) => intervalMonths(interval.unit, interval.count);

/** The same instant `months` calendar months later or earlier, on the last day where it is shorter. */
function addMonths(seconds: number, months: number) {
  const date = new Date(seconds * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const time = seconds * 1000 - Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  return (Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)) + time) / 1000;
}

/**
 * The instant `times` intervals after `seconds`, or before it for a negative `times`. Months are
 * calendar months, since Mollie charges a monthly subscription on the same day of each month.
 */
export function shift(seconds: number, interval: MollieInterval, times = 1) {
  if (interval.unit === "month") return addMonths(seconds, times * interval.count);
  return seconds + times * interval.count * (interval.unit === "week" ? 7 : 1) * DAY;
}

/** When a subscription's first charge day starts, or null when it cannot be read. */
export function startOf(subscription: MollieSubscription) {
  const date = subscription.startDate;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const at = dayStart(date);
  return Number.isNaN(at) ? null : at;
}

const minor = (money: MollieAmount) => toMinorUnits(money.value, money.currency);

/** An amount in the payment's currency, or nothing when it is missing or in another currency. */
function minorIn(money: MollieAmount | null | undefined, currency: string) {
  return money && money.currency.toLowerCase() === currency.toLowerCase() ? minor(money) : 0;
}

export const paid = (payment: MolliePayment) => payment.status === "paid";

/**
 * What a payment earned: its amount without the VAT its lines name, less what was refunded and
 * charged back at the same untaxed share. A payment without lines carries no tax, so it counts as
 * charged.
 */
export function earned(payment: MolliePayment) {
  const amount = minor(payment.amount);
  if (!(amount > 0)) return 0;
  const currency = payment.amount.currency;
  const vat = (payment.lines ?? []).reduce(
    (sum, line) => sum + minorIn(line.vatAmount, currency),
    0,
  );
  const untaxed = amount - Math.min(amount, Math.max(0, vat));
  const back =
    minorIn(payment.amountRefunded, currency) + minorIn(payment.amountChargedBack, currency);
  return netOf(untaxed, (back * untaxed) / amount);
}

/**
 * The first payment that paid for each subscription's time before it started: a paid first
 * payment of its customer, in its currency, for at least its amount after refunds, made within an
 * interval and a week before the day it starts. Each payment pays ahead for one subscription.
 */
export function paidAhead(subscriptions: MollieSubscription[], payments: MolliePayment[]) {
  const firsts = new Map<string, { payment: MolliePayment; at: number }[]>();
  for (const payment of payments) {
    const at = unixSeconds(payment.createdAt);
    if (!paid(payment) || payment.sequenceType !== "first" || payment.subscriptionId) continue;
    if (!payment.customerId || at === null) continue;
    const list = firsts.get(payment.customerId) ?? [];
    list.push({ payment, at });
    firsts.set(payment.customerId, list);
  }
  const used = new Set<string>();
  const found = new Map<string, MolliePayment>();
  const byStart = [...subscriptions].sort((a, b) =>
    (a.startDate ?? "").localeCompare(b.startDate ?? ""),
  );
  for (const subscription of byStart) {
    const interval = parseInterval(subscription.interval);
    const start = startOf(subscription);
    const candidates = firsts.get(subscription.customerId);
    if (!interval || start === null || !candidates) continue;
    const from = shift(start, interval, -1) - GRACE;
    const price = minor(subscription.amount);
    let best: { payment: MolliePayment; at: number } | null = null;
    for (const candidate of candidates) {
      const { payment, at } = candidate;
      if (at < from || at >= start || used.has(payment.id)) continue;
      if (payment.amount.currency.toLowerCase() !== subscription.amount.currency.toLowerCase())
        continue;
      if (earned(payment) < price - 0.5) continue;
      if (!best || at > best.at) best = candidate;
    }
    if (best) {
      used.add(best.payment.id);
      found.set(subscription.id, best.payment);
    }
  }
  return found;
}

/**
 * Payments created since this instant hold the first payments that may have paid ahead for the
 * active subscriptions that start later; null when there are none to read.
 */
export function paidAheadWindowStart(subscriptions: MollieSubscription[], now: number) {
  let start: number | null = null;
  for (const subscription of subscriptions) {
    if (subscription.status !== COUNTED_STATUS) continue;
    const interval = parseInterval(subscription.interval);
    const day = startOf(subscription);
    if (!interval || day === null || day <= now) continue;
    const from = shift(day, interval, -1) - GRACE;
    if (from < now) start = start === null ? from : Math.min(start, from);
  }
  return start;
}

/**
 * MRR from active subscriptions, with `payments` holding at least those created since
 * `paidAheadWindowStart`, so a subscription that starts later counts when it was paid ahead.
 */
export function mollieMrr(
  subscriptions: MollieSubscription[],
  payments: MolliePayment[],
  now: number,
) {
  const ahead = paidAhead(subscriptions, payments);
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  const seen = new Set<string>();
  for (const subscription of subscriptions) {
    if (subscription.status !== COUNTED_STATUS || seen.has(subscription.id)) continue;
    seen.add(subscription.id);
    const interval = parseInterval(subscription.interval);
    if (!interval) {
      subscriptionIds.push(subscription.id);
      skippedItems++;
      continue;
    }
    const start = startOf(subscription);
    // A trial: nothing is paid until the subscription starts.
    if (start !== null && start > now && !ahead.has(subscription.id)) continue;
    subscriptionIds.push(subscription.id);
    const monthly = minor(subscription.amount) / months(interval);
    if (monthly > 0) {
      addTo(byCurrency, subscription.amount.currency, monthly);
      payingCustomers.add(subscription.customerId);
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}

/**
 * Service lines from paid payments, after refunds and chargebacks. Mollie does not say which period
 * a payment covers, so a subscription's payment covers one interval of it from when it was created,
 * which is the day Mollie charges it. A first payment that paid ahead covers the time until its
 * subscription started, at the subscription's amount at most, since the rest was not recurring.
 * Payments of subscriptions whose interval cannot be read are left out.
 */
export function mollieServiceLines(
  payments: MolliePayment[],
  subscriptions: MollieSubscription[],
): ServiceLine[] {
  const byId = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
  const lines: ServiceLine[] = [];
  for (const payment of payments) {
    if (!paid(payment) || !payment.subscriptionId) continue;
    const subscription = byId.get(payment.subscriptionId);
    const interval = subscription && parseInterval(subscription.interval);
    const start = unixSeconds(payment.createdAt);
    const value = earned(payment);
    if (!interval || start === null || value <= 0) continue;
    lines.push({
      start,
      end: shift(start, interval),
      currency: payment.amount.currency.toLowerCase(),
      monthly: value / months(interval),
    });
  }
  for (const [id, payment] of paidAhead(subscriptions, payments)) {
    const subscription = byId.get(id)!;
    const value = Math.min(earned(payment), minor(subscription.amount));
    if (value <= 0) continue;
    lines.push({
      start: unixSeconds(payment.createdAt)!,
      end: startOf(subscription)!,
      currency: payment.amount.currency.toLowerCase(),
      monthly: value / months(parseInterval(subscription.interval)!),
    });
  }
  return lines;
}
