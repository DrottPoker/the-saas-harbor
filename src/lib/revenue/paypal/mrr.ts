// Monthly recurring revenue from PayPal's transactions. Pure functions: no I/O, fully testable.
// The founder's app can only search transactions, which do not say what a subscription costs or
// how often it renews. A subscription's payment (event code T0002) names its subscription, so the
// billing period is the time between two of its payments for the same amount: a whole number of
// weeks up to three, or of months up to twelve, PayPal's longest. A subscription without two such
// payments in a row counts as yearly, which never overstates it, until its next payment shows the
// period. It counts until a week after its period ends, for a payment PayPal retries or lists
// late. Amounts are without the tax PayPal reports, and a payment refunded in full does not count.
import { unixSeconds, type ServiceLine } from "../history";
import { addTo, AVERAGE_MONTH_DAYS, intervalMonths, toMinorUnits } from "../money";

export type PayPalMoney = { currency_code: string; value: string };

/** A transaction as the search lists it, in `transaction_info`. */
export type PayPalTransaction = {
  transaction_id: string;
  /** The subscription a payment belongs to (type SUB), or the payment a refund takes from (TXN). */
  paypal_reference_id?: string | null;
  paypal_reference_id_type?: string | null;
  transaction_event_code?: string | null;
  transaction_initiation_date?: string | null;
  /** The gross amount: positive when money came in, negative when it went out. */
  transaction_amount?: PayPalMoney | null;
  sales_tax_amount?: PayPalMoney | null;
  /** S successful, P pending, D denied, V refunded in full. */
  transaction_status?: string | null;
};

/** A subscription's successful payment, in minor units without tax. */
export type SubscriptionCharge = {
  id: string;
  subscription: string;
  at: number;
  currency: string;
  amount: number;
};

const DAY = 86_400;
/** A subscription counts this long after its period ends. */
export const GRACE = 7 * DAY;
/** The months a subscription counts as while its period is unknown: PayPal's longest. */
export const LONGEST_MONTHS = 12;
export const SUBSCRIPTION_PAYMENT = "T0002";

/** Unix seconds from PayPal's time, which may give its offset without a colon (+0000). */
export function paypalSeconds(value: string | null | undefined) {
  return unixSeconds(value?.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

/** An amount in minor units, or null without one. */
export function minorAmount(money: PayPalMoney | null | undefined) {
  if (!money?.currency_code || money.value == null) return null;
  return toMinorUnits(money.value, money.currency_code);
}

/** What a payment that came in earned before refunds: its gross amount less its tax. */
export function untaxedAmount(transaction: PayPalTransaction) {
  const gross = minorAmount(transaction.transaction_amount);
  if (gross === null || gross <= 0) return null;
  const tax = Math.min(gross, Math.max(0, minorAmount(transaction.sales_tax_amount) ?? 0));
  return { gross, net: gross - tax };
}

/** The successful payments that came in for subscriptions, each once. */
export function subscriptionCharges(transactions: PayPalTransaction[]): SubscriptionCharge[] {
  const charges = new Map<string, SubscriptionCharge>();
  for (const transaction of transactions) {
    const subscription = transaction.paypal_reference_id;
    if (
      transaction.transaction_event_code !== SUBSCRIPTION_PAYMENT ||
      transaction.transaction_status !== "S" ||
      transaction.paypal_reference_id_type !== "SUB" ||
      !subscription
    )
      continue;
    const at = paypalSeconds(transaction.transaction_initiation_date);
    const amount = untaxedAmount(transaction);
    if (at === null || !amount) continue;
    charges.set(transaction.transaction_id, {
      id: transaction.transaction_id,
      subscription,
      at,
      currency: transaction.transaction_amount!.currency_code.toLowerCase(),
      amount: amount.net,
    });
  }
  return [...charges.values()];
}

/**
 * Months between two payments of a subscription when they are a billing period apart, give or
 * take PayPal's timing: whole weeks up to three, or whole months up to twelve. Null otherwise.
 */
export function billingMonths(from: number, to: number) {
  const days = (to - from) / DAY;
  const weeks = Math.round(days / 7);
  if (weeks >= 1 && weeks <= 3 && Math.abs(days - weeks * 7) <= 1)
    return intervalMonths("week", weeks);
  const months = Math.round(days / AVERAGE_MONTH_DAYS);
  if (
    months >= 1 &&
    months <= LONGEST_MONTHS &&
    Math.abs(days - months * AVERAGE_MONTH_DAYS) <= 3.5
  )
    return months;
  return null;
}

/** The months between two charges of a subscription, when both are for the same amount. */
function periodBetween(
  earlier: SubscriptionCharge | undefined,
  later: SubscriptionCharge | undefined,
) {
  if (!earlier || !later || earlier.currency !== later.currency) return null;
  if (Math.abs(earlier.amount - later.amount) >= 0.5) return null;
  return billingMonths(earlier.at, later.at);
}

/** Each subscription's charges, oldest first. */
function bySubscription(charges: SubscriptionCharge[]) {
  const lists = new Map<string, SubscriptionCharge[]>();
  for (const charge of charges) {
    const list = lists.get(charge.subscription) ?? [];
    list.push(charge);
    lists.set(charge.subscription, list);
  }
  for (const list of lists.values()) list.sort((a, b) => a.at - b.at);
  return lists;
}

const seconds = (months: number) => months * AVERAGE_MONTH_DAYS * DAY;

/** Subscription payments from this day on hold every counted subscription's latest two. */
export function mrrWindowStart(now: Date) {
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, now.getUTCDate()) / 1000,
  );
}

function yearlyNote(count: number) {
  if (!count) return null;
  return count === 1
    ? "1 subscription counts as yearly until its next payment shows how often it renews."
    : `${count} subscriptions count as yearly until their next payment shows how often they renew.`;
}

/** Each subscription valued by its latest charge over its billing period. */
export function paypalMrr(charges: SubscriptionCharge[], now: number) {
  const byCurrency: Record<string, number> = {};
  const subscriptionIds: string[] = [];
  let customers = 0;
  let yearly = 0;
  for (const [subscription, list] of bySubscription(charges)) {
    const latest = list.at(-1)!;
    const known = periodBetween(list.at(-2), latest);
    const months = known ?? LONGEST_MONTHS;
    if (now >= latest.at + seconds(months) + GRACE) continue;
    subscriptionIds.push(subscription);
    if (!known) yearly++;
    const monthly = latest.amount / months;
    if (monthly > 0) {
      addTo(byCurrency, latest.currency, monthly);
      customers++;
    }
  }
  return { byCurrency, customers, subscriptionIds, skippedItems: 0, mrrNote: yearlyNote(yearly) };
}

/**
 * Service lines from the charges. A charge followed by one for the same amount a billing period
 * later pays for the time until it; any other pays at the rate of the period before it, or else of
 * a year, and ends at the subscription's next charge at the latest.
 */
export function paypalServiceLines(charges: SubscriptionCharge[]): ServiceLine[] {
  return [...bySubscription(charges).values()].flatMap((list) =>
    list.map((charge, index) => {
      const next = list[index + 1];
      const until = periodBetween(charge, next);
      const months = until ?? periodBetween(list[index - 1], charge) ?? LONGEST_MONTHS;
      const end =
        until !== null ? next!.at : Math.min(charge.at + seconds(months), next?.at ?? Infinity);
      return { start: charge.at, end, currency: charge.currency, monthly: charge.amount / months };
    }),
  );
}
