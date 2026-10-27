// Monthly recurring revenue from Mercado Pago. Pure functions: no I/O, fully testable.
// Mercado Pago calls a subscription a preapproval. An authorized one has a valid payment method
// and is charged its `auto_recurring` amount every so many months or days; one whose payment
// failed stays authorized while Mercado Pago retries, so it counts like a past-due subscription.
// Pending (no payment method yet), paused and cancelled ones are not counted, nor one still in its
// free trial, one that has not started or one past its end date. A preapproval gives no tax, so
// MRR counts what each subscription is charged; payments give their tax, which the history and
// revenue take off. Amounts are decimal major units in each currency, CLP included, so they are
// turned into minor units with `toMinorUnits`.
import { unixSeconds, type ServiceLine } from "../history";
import { addTo, intervalMonths, toMinorUnits } from "../money";

type Frequency = { frequency?: number | string | null; frequency_type?: string | null };

export type MercadoPagoAutoRecurring = Frequency & {
  /** What each invoice charges, in major units; the API may give it as a string. */
  transaction_amount?: number | string | null;
  currency_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  free_trial?: Frequency | string | null;
};

export type MercadoPagoPreapproval = {
  id: string;
  status: string;
  payer_id?: number | string | null;
  collector_id?: number | string | null;
  date_created?: string | null;
  auto_recurring?: MercadoPagoAutoRecurring | null;
};

/** A payment as the payment search lists it. Amounts are in major units. */
export type MercadoPagoPayment = {
  id: number | string;
  status?: string | null;
  date_approved?: string | null;
  operation_type?: string | null;
  currency_id?: string | null;
  transaction_amount?: number | string | null;
  transaction_amount_refunded?: number | string | null;
  taxes_amount?: number | string | null;
  coupon_amount?: number | string | null;
  live_mode?: boolean | null;
  collector_id?: number | string | null;
  /** The subscription a recurring charge belongs to, where Mercado Pago records it. */
  point_of_interaction?: {
    type?: string | null;
    transaction_data?: { subscription_id?: string | null } | null;
  } | null;
  metadata?: Record<string, unknown> | null;
  preapproval_id?: string | null;
};

const DAY = 86_400;

/**
 * Operations that are sales: an ordinary payment, a subscription's charge, and a sale at a card
 * reader. Transfers between users, deposits, investments and phone top-ups are not.
 */
export const SALES = new Set([
  "regular_payment",
  "recurring_payment",
  "subscription_payment",
  "pos_payment",
]);
/** Operations Mercado Pago marks as a subscription's charge. */
const SUBSCRIPTION_OPERATIONS = new Set(["recurring_payment", "subscription_payment"]);

/** Months in a frequency of months or days, or null for one that cannot be read. */
export function frequencyMonths(value: Frequency | string | null | undefined) {
  if (!value || typeof value === "string") return null;
  const count = Number(value.frequency);
  if (!Number.isFinite(count) || count <= 0) return null;
  if (value.frequency_type === "months") return count;
  if (value.frequency_type === "days") return intervalMonths("day", count);
  return null;
}

/** An amount in minor units, or null without a readable amount and currency. */
export function minorAmount(value: number | string | null | undefined, currency: string) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? toMinorUnits(amount, currency) : null;
}

/** The same instant a number of calendar months later, on the last day where a month is shorter. */
function addMonths(seconds: number, months: number) {
  const date = new Date(seconds * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const time = seconds * 1000 - Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  return (Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)) + time) / 1000;
}

/** The end of one frequency from `start`: calendar months, or whole days. */
export function periodEnd(start: number, value: Frequency) {
  const count = Number(value.frequency);
  return value.frequency_type === "months" ? addMonths(start, count) : start + count * DAY;
}

/** When a preapproval starts charging: its start date, or when it was created. */
function startOf(preapproval: MercadoPagoPreapproval) {
  return (
    unixSeconds(preapproval.auto_recurring?.start_date) ?? unixSeconds(preapproval.date_created)
  );
}

/** When a preapproval's free trial ends, or null without one. */
export function trialEnd(preapproval: MercadoPagoPreapproval) {
  const trial = preapproval.auto_recurring?.free_trial;
  const start = startOf(preapproval);
  if (!trial || typeof trial === "string" || frequencyMonths(trial) === null || start === null)
    return null;
  return periodEnd(start, trial);
}

/** An authorized preapproval of the seller's that has started, is past any trial, and has not ended. */
export function isCounted(preapproval: MercadoPagoPreapproval, now: number, userId: string) {
  if (preapproval.status !== "authorized") return false;
  if (preapproval.collector_id != null && String(preapproval.collector_id) !== userId) return false;
  const start = startOf(preapproval);
  if (start !== null && start > now) return false;
  if ((trialEnd(preapproval) ?? 0) > now) return false;
  const end = unixSeconds(preapproval.auto_recurring?.end_date);
  return end === null || end > now;
}

export function mercadoPagoMrr(
  preapprovals: MercadoPagoPreapproval[],
  now: number,
  userId: string,
) {
  const byCurrency: Record<string, number> = {};
  const payingCustomers = new Set<string>();
  const subscriptionIds: string[] = [];
  let skippedItems = 0;
  for (const preapproval of preapprovals) {
    if (!isCounted(preapproval, now, userId)) continue;
    const recurring = preapproval.auto_recurring;
    const currency = recurring?.currency_id?.toLowerCase();
    const months = frequencyMonths(recurring);
    const amount = currency ? minorAmount(recurring?.transaction_amount, currency) : null;
    // A subscription without an amount, currency or frequency that can be read.
    if (!currency || !months || amount === null) {
      skippedItems++;
      continue;
    }
    subscriptionIds.push(preapproval.id);
    const monthly = amount / months;
    if (monthly > 0) {
      addTo(byCurrency, currency, monthly);
      payingCustomers.add(String(preapproval.payer_id ?? preapproval.id));
    }
  }
  return { byCurrency, customers: payingCustomers.size, subscriptionIds, skippedItems };
}

/**
 * The subscription a payment paid for, where Mercado Pago names it: the subscription in its
 * point of interaction, or the preapproval in its metadata or on the payment itself.
 */
export function preapprovalOf(payment: MercadoPagoPayment) {
  const id =
    payment.point_of_interaction?.transaction_data?.subscription_id ??
    payment.metadata?.preapproval_id ??
    payment.preapproval_id;
  return typeof id === "string" && id ? id : null;
}

/** Whether a payment paid for a subscription: it names one, or its operation says so. */
export function isSubscriptionPayment(payment: MercadoPagoPayment) {
  return !!preapprovalOf(payment) || SUBSCRIPTION_OPERATIONS.has(payment.operation_type ?? "");
}

/**
 * What a payment charged, in minor units: `paid` after the seller's coupon, and `untaxed` without
 * the tax Mercado Pago recorded on it either. Null without an amount.
 */
export function chargedAmount(payment: MercadoPagoPayment) {
  const currency = payment.currency_id?.toLowerCase();
  if (!currency) return null;
  const gross = minorAmount(payment.transaction_amount, currency);
  if (gross === null || gross <= 0) return null;
  const coupon = Math.max(0, minorAmount(payment.coupon_amount, currency) ?? 0);
  const paid = Math.max(0, gross - coupon);
  const tax = Math.min(paid, Math.max(0, minorAmount(payment.taxes_amount, currency) ?? 0));
  return { currency, gross, paid, untaxed: paid - tax };
}

/**
 * An approved sale paid to the seller, dated by its approval. A live connection leaves out
 * payments made in test mode.
 */
export function isSale(payment: MercadoPagoPayment, live: boolean, userId: string) {
  if (payment.status !== "approved" || !payment.date_approved) return false;
  if (live && payment.live_mode === false) return false;
  if (payment.collector_id != null && String(payment.collector_id) !== userId) return false;
  return !payment.operation_type || SALES.has(payment.operation_type);
}

/**
 * Payments approved from this instant on can still be listed: the search covers the last twelve
 * months, so it is read from the start of the day after 365 days ago.
 */
export function searchStart(now: number) {
  const yearAgo = now - 365 * DAY;
  return yearAgo - (yearAgo % DAY) + DAY;
}

/**
 * Service lines from approved subscription charges: each counts its untaxed amount over one
 * frequency of its subscription from when it was approved. Partial refunds are left in, since the
 * subscription's rate did not change. Null when charges of subscriptions were listed but none named
 * a subscription that was read, so the history cannot be told apart from an empty one.
 */
export function mercadoPagoServiceLines(
  payments: MercadoPagoPayment[],
  preapprovals: ReadonlyMap<string, MercadoPagoPreapproval>,
  live: boolean,
  userId: string,
): ServiceLine[] | null {
  const lines: ServiceLine[] = [];
  let unnamed = 0;
  for (const payment of payments) {
    if (!isSale(payment, live, userId) || !isSubscriptionPayment(payment)) continue;
    const preapproval = preapprovals.get(preapprovalOf(payment) ?? "");
    const recurring = preapproval?.auto_recurring;
    const months = frequencyMonths(recurring);
    const charged = chargedAmount(payment);
    const start = unixSeconds(payment.date_approved);
    if (!preapproval) unnamed++;
    if (!recurring || !months || !charged || start === null) continue;
    lines.push({
      start,
      end: periodEnd(start, recurring),
      currency: charged.currency,
      monthly: charged.untaxed / months,
    });
  }
  return unnamed && !lines.length ? null : lines;
}
