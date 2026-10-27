// Monthly recurring revenue from Asaas subscriptions. Pure functions: no I/O, fully testable.
// An Asaas subscription stays ACTIVE while its charges go unpaid, and a boleto or Pix customer who
// stops paying leaves it so, so a subscription counts only while a paid charge covers it. A charge
// pays for one cycle from its due date: the first falls due when the subscription starts, and the
// later ones are created up to 40 days ahead, so Asaas bills in advance. A subscription counts until
// two weeks after its paid cycle ends, for a boleto or Pix paid late or a card charge retried. It
// counts at its value less its discount, which Asaas grants on every charge paid by a set day before
// it falls due; taking it as granted never overstates MRR. Asaas bills in reais only, and its
// charges carry no tax, so what is charged counts.
import { dayStart } from "../payments";
import { AVERAGE_MONTH_DAYS, addTo, toMinorUnits } from "../money";
import type { ServiceLine } from "../history";

export type AsaasCycle =
  "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";

/** A discount for paying by `dueDateLimitDays` before the due date, fixed or in percent. */
export type AsaasDiscount = {
  value?: number | null;
  type?: "FIXED" | "PERCENTAGE" | null;
  dueDateLimitDays?: number | null;
};

/** A subscription as Asaas lists it. Amounts are in reais. */
export type AsaasSubscription = {
  id: string;
  customer?: string | null;
  value: number;
  cycle: string;
  status: string;
  discount?: AsaasDiscount | null;
  deleted?: boolean | null;
};

export type AsaasRefund = { status?: string | null; value?: number | null };

/** A charge as Asaas lists it, a payment once paid. Amounts are in reais, dates YYYY-MM-DD. */
export type AsaasPayment = {
  id: string;
  customer?: string | null;
  subscription?: string | null;
  installment?: string | null;
  paymentLink?: string | null;
  checkoutSession?: string | null;
  pixQrCodeId?: string | null;
  description?: string | null;
  /** What was charged, or paid once paid: after a discount, with interest and fines. */
  value: number;
  /** The amount first charged, given when what was paid differs. */
  originalValue?: number | null;
  status: string;
  dueDate?: string | null;
  originalDueDate?: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  deleted?: boolean | null;
  refunds?: AsaasRefund[] | null;
};

export const CURRENCY = "brl";
const DAY = 86_400;
/** A subscription counts this long after the cycle its latest paid charge pays for ends. */
export const GRACE = 14 * DAY;

/**
 * Months per cycle. Asaas does not say how long BIWEEKLY (quinzenal in its dashboard) is; half a
 * month is the longer reading, which never overstates MRR.
 */
export const CYCLE_MONTHS: Record<AsaasCycle, number> = {
  WEEKLY: 7 / AVERAGE_MONTH_DAYS,
  BIWEEKLY: 0.5,
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUALLY: 6,
  YEARLY: 12,
};

/** Charges in these statuses were paid and keep what they earned. */
export const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "AWAITING_CHARGEBACK_REVERSAL"]);

export function cycleMonths(cycle: string) {
  return (CYCLE_MONTHS as Record<string, number | undefined>)[cycle] ?? null;
}

/** The Unix time a YYYY-MM-DD date starts, or null without one. */
export function dateStart(value: string | null | undefined) {
  const day = value?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? dayStart(day) : null;
}

/** When a cycle from `start` ends: whole calendar months, or days for weekly cycles. */
export function cycleEnd(start: number, months: number) {
  if (!Number.isInteger(months)) return start + months * AVERAGE_MONTH_DAYS * DAY;
  const date = new Date(start * 1000);
  const [year, month, day] = [
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate(),
  ];
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(day, lastDay)) / 1000;
}

/** The value of each charge less the discount, in minor units, never below nothing. */
export function discountedValue(subscription: AsaasSubscription) {
  const value = Number(subscription.value);
  const discount = Math.max(0, Number(subscription.discount?.value) || 0);
  const after =
    subscription.discount?.type === "PERCENTAGE"
      ? value * (1 - Math.min(100, discount) / 100)
      : value - discount;
  return Math.max(0, toMinorUnits(after, CURRENCY));
}

/** What a paid charge was for, in minor units: what was paid, without interest and fines. */
export function chargeAmount(payment: AsaasPayment) {
  const paid = Number(payment.value);
  const original = payment.originalValue == null ? paid : Number(payment.originalValue);
  return Math.max(0, toMinorUnits(Math.min(paid, original), CURRENCY));
}

/** The day a charge's cycle starts: the due date it was created with. */
export function chargeStart(payment: AsaasPayment) {
  return dateStart(payment.originalDueDate) ?? dateStart(payment.dueDate);
}

/** Paid charges of subscriptions, each subscription's oldest first. */
function paidCharges(payments: AsaasPayment[]) {
  const bySubscription = new Map<string, AsaasPayment[]>();
  for (const payment of payments) {
    if (!payment.subscription || payment.deleted || !PAID_STATUSES.has(payment.status)) continue;
    const list = bySubscription.get(payment.subscription) ?? [];
    list.push(payment);
    bySubscription.set(payment.subscription, list);
  }
  return bySubscription;
}

/**
 * The earliest due date (YYYY-MM-DD) of a charge that can still cover a subscription with this
 * cycle at `now`, with a day to spare: charges due since then show whether it is paid up.
 */
export function coverageStart(months: number, now: Date) {
  const seconds = now.getTime() / 1000 - (months * AVERAGE_MONTH_DAYS + 1) * DAY - GRACE;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** The ids of the subscriptions a paid charge covers at `now`. */
export function paidUp(subscriptions: AsaasSubscription[], payments: AsaasPayment[], now: Date) {
  const charges = paidCharges(payments);
  const nowSeconds = now.getTime() / 1000;
  const covered = new Set<string>();
  for (const subscription of subscriptions) {
    const months = cycleMonths(subscription.cycle);
    if (months === null) continue;
    const paid = (charges.get(subscription.id) ?? []).some((charge) => {
      const start = chargeStart(charge);
      return start !== null && nowSeconds < cycleEnd(start, months) + GRACE;
    });
    if (paid) covered.add(subscription.id);
  }
  return covered;
}

/** Counted subscriptions are active, not removed, and on a cycle Asaas documents. */
export function activeSubscriptions(subscriptions: AsaasSubscription[]) {
  return subscriptions.filter(
    (subscription) => subscription.status === "ACTIVE" && !subscription.deleted,
  );
}

/**
 * MRR from active subscriptions that a paid charge covers. The others are not counted, and the
 * founder is told how many (`skippedItems`).
 */
export function asaasMrr(subscriptions: AsaasSubscription[], payments: AsaasPayment[], now: Date) {
  const active = activeSubscriptions(subscriptions);
  const covered = paidUp(active, payments, now);
  const byCurrency: Record<string, number> = {};
  const subscriptionIds: string[] = [];
  const customers = new Set<string>();
  let skippedItems = 0;
  for (const subscription of active) {
    const months = cycleMonths(subscription.cycle);
    if (months === null || !covered.has(subscription.id)) {
      skippedItems++;
      continue;
    }
    subscriptionIds.push(subscription.id);
    const monthly = discountedValue(subscription) / months;
    if (monthly > 0) {
      addTo(byCurrency, CURRENCY, monthly);
      customers.add(subscription.customer || subscription.id);
    }
  }
  return { byCurrency, customers: customers.size, subscriptionIds, skippedItems };
}

/**
 * Service lines from paid charges of subscriptions: each over the cycle from its due date, at what
 * it was paid without interest and fines, on the cycle of its subscription, which charges do not
 * carry. Refunded charges and those in a chargeback are left out.
 */
export function asaasServiceLines(
  payments: AsaasPayment[],
  subscriptions: AsaasSubscription[],
): ServiceLine[] {
  const cycles = new Map(
    subscriptions.map((subscription) => [subscription.id, subscription.cycle]),
  );
  const lines: ServiceLine[] = [];
  for (const [subscription, charges] of paidCharges(payments)) {
    const months = cycleMonths(cycles.get(subscription) ?? "");
    if (months === null) continue;
    for (const charge of charges) {
      const start = chargeStart(charge);
      if (start === null) continue;
      lines.push({
        start,
        end: cycleEnd(start, months),
        currency: CURRENCY,
        monthly: chargeAmount(charge) / months,
      });
    }
  }
  return lines;
}
