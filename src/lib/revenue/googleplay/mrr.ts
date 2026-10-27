// Monthly recurring revenue from Play Console's estimated sales reports. Pure functions: no I/O,
// fully testable.
//
// The reports list each charge, not subscriptions or their prices, but a subscription's charges
// form a chain: the first order's number, then the same number with `..0`, `..1` and so on for its
// renewals. Each chain is one subscription, valued by its latest charge (the item price, which is
// without tax) over its billing period. Google Play bills a base plan every week, four weeks, or
// one, two, three, four, six, eight or twelve months, and a base plan's period is fixed, so the
// period is learned per base plan from the time between consecutive charges of all its chains,
// snapped to those periods; the most common wins, and the longer one of a tie. A first charge
// bought with an offer may cover an introductory period of its own, so it uses the period its
// offer shows in other chains. A subscription whose period nothing shows counts as yearly, which
// never overstates it, until a renewal shows the period. Statistics of active subscriptions exist
// too, but without prices, so the charges are the more exact source.
//
// The reports run a few days behind, so a subscription counts until a week after its period ends:
// a new subscription shows once its first charge is in the report, and an ended one leaves MRR a
// week after the period it paid for. A charge refunded in full does not count.
import type { ServiceLine } from "../history";
import { addTo, intervalMonths } from "../money";
import type { SaleRow } from "./report";

const DAY = 86_400;
/** A subscription counts this long after its period ends, for the reports' delay and retries. */
export const GRACE = 7 * DAY;

/** A charge, in minor units without tax, with what refunds took back. */
export type SaleCharge = {
  order: string;
  /** The subscription's first order number, shared by its renewals. */
  chain: string;
  /** 0 for the first order, then 1 for the renewal `..0`, 2 for `..1` and so on. */
  cycle: number;
  at: number;
  packageName: string;
  subscription: boolean;
  /** The package, product and base plan, which fix the billing period. */
  plan: string;
  offer: string;
  currency: string;
  amount: number;
  refunded: number;
};

/** A billing period of Google Play. */
export type Period = { unit: "week" | "month"; count: number };

/** Google Play's billing periods for auto-renewing base plans, shortest first. */
export const PERIODS: Period[] = [
  { unit: "week", count: 1 },
  { unit: "week", count: 4 },
  ...[1, 2, 3, 4, 6, 8, 12].map((count) => ({ unit: "month" as const, count })),
];
const YEAR: Period = { unit: "month", count: 12 };

/** The same instant `months` calendar months later, on the last day where the month is shorter. */
function addMonths(seconds: number, months: number) {
  const date = new Date(seconds * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const time = seconds * 1000 - Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  return (Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)) + time) / 1000;
}

export function periodEnd(at: number, period: Period) {
  return period.unit === "week" ? at + period.count * 7 * DAY : addMonths(at, period.count);
}

export function periodMonths(period: Period) {
  return intervalMonths(period.unit, period.count);
}

/**
 * The billing period two consecutive charges are apart, give or take a day for weekly plans and
 * three days for others, as retries move a charge; the nearer one, or the longer of a tie (four
 * weeks and a month in February). Null for any other gap, such as one with a pause in it.
 */
export function snapPeriod(from: number, to: number) {
  let best: Period | null = null;
  let distance = Infinity;
  for (const period of PERIODS) {
    const off = Math.abs(periodEnd(from, period) - to);
    const tolerance = period.unit === "week" && period.count === 1 ? DAY : 3 * DAY;
    if (off <= tolerance && off <= distance) {
      best = period;
      distance = off;
    }
  }
  return best;
}

/** An order number's chain and cycle: `GPA.1234-...-12345..2` is the third renewal. */
export function orderCycle(order: string) {
  const match = /^(.+?)(?:\.\.(\d+))?$/.exec(order)!;
  return { chain: match[1]!, cycle: match[2] === undefined ? 0 : Number(match[2]) + 1 };
}

/** What a charge earned before refunds: its item price, or the charged amount less tax. */
function untaxed(row: SaleRow) {
  if (row.itemPrice !== null) return row.itemPrice;
  if (row.charged !== null) return row.charged - Math.max(0, row.taxes ?? 0);
  return null;
}

const isRefund = (row: SaleRow) => row.status.includes("refund");

/**
 * What a refund row took back, without tax. The sign of refund amounts is not documented, so the
 * size counts; a full refund without an amount takes everything.
 */
function refundAmount(row: SaleRow) {
  const amount = untaxed(row);
  if (amount !== null && amount !== 0) return Math.abs(amount);
  return row.status === "refund" ? Infinity : 0;
}

/**
 * The charges of the rows, each order once, with what its refunds took back; `unreadable` counts
 * subscription charges whose amount or currency could not be read, by their order numbers.
 */
export function saleCharges(rows: SaleRow[]) {
  const refunds = new Map<string, number>();
  for (const row of rows)
    if (isRefund(row)) refunds.set(row.order, (refunds.get(row.order) ?? 0) + refundAmount(row));
  const charges = new Map<string, SaleCharge>();
  const unreadable: { order: string; at: number }[] = [];
  for (const row of rows) {
    if (row.status !== "charged" || charges.has(row.order)) continue;
    const subscription = row.productType.includes("subscription");
    const amount = untaxed(row);
    if (amount === null || row.currency === null) {
      if (subscription) unreadable.push({ order: row.order, at: row.at });
      continue;
    }
    if (amount <= 0) continue;
    charges.set(row.order, {
      order: row.order,
      ...orderCycle(row.order),
      at: row.at,
      packageName: row.packageName,
      subscription,
      plan: `${row.packageName}/${row.sku}/${row.basePlan}`,
      offer: row.offer,
      currency: row.currency,
      amount,
      refunded: Math.min(amount, refunds.get(row.order) ?? 0),
    });
  }
  return { charges: [...charges.values()], unreadable };
}

/** Subscription charges that still count: not refunded in full. */
export function subscriptionCharges(charges: SaleCharge[]) {
  return charges.filter((charge) => charge.subscription && charge.refunded < charge.amount - 0.5);
}

/** Each subscription's charges, oldest first. */
function byChain(charges: SaleCharge[]) {
  const chains = new Map<string, SaleCharge[]>();
  for (const charge of charges) {
    const list = chains.get(charge.chain) ?? [];
    list.push(charge);
    chains.set(charge.chain, list);
  }
  for (const list of chains.values()) list.sort((a, b) => a.cycle - b.cycle || a.at - b.at);
  return chains;
}

const periodKey = (period: Period) => `${period.unit}:${period.count}`;

/** Whether a charge may cover an introductory period: a first order bought with an offer. */
const introductory = (charge: SaleCharge) => charge.cycle === 0 && charge.offer !== "";
const offerKey = (charge: SaleCharge) => `${charge.plan}\n${charge.offer}`;

/**
 * The billing periods the charges show: per base plan from any charge that is not introductory,
 * and per offer from introductory ones. Each is the most common gap to the next renewal, the
 * longer of a tie.
 */
export function learnPeriods(charges: SaleCharge[]) {
  const votes = new Map<string, Map<string, { period: Period; count: number }>>();
  for (const list of byChain(charges).values())
    for (let i = 0; i + 1 < list.length; i++) {
      const [charge, next] = [list[i]!, list[i + 1]!];
      if (next.cycle !== charge.cycle + 1 || next.plan !== charge.plan) continue;
      const period = snapPeriod(charge.at, next.at);
      if (!period) continue;
      const key = introductory(charge) ? offerKey(charge) : charge.plan;
      const tally = votes.get(key) ?? new Map();
      const vote = tally.get(periodKey(period)) ?? { period, count: 0 };
      vote.count++;
      tally.set(periodKey(period), vote);
      votes.set(key, tally);
    }
  const periods = new Map<string, Period>();
  for (const [key, tally] of votes) {
    const best = [...tally.values()].sort(
      (a, b) => b.count - a.count || periodMonths(b.period) - periodMonths(a.period),
    )[0]!;
    periods.set(key, best.period);
  }
  return (charge: SaleCharge) =>
    periods.get(introductory(charge) ? offerKey(charge) : charge.plan) ?? null;
}

function yearlyNote(count: number) {
  if (!count) return null;
  return count === 1
    ? "1 subscription counts as yearly until a renewal shows how often it renews."
    : `${count} subscriptions count as yearly until a renewal shows how often they renew.`;
}

/** Subscription charges from this day on hold every counted subscription's latest two. */
export function mrrWindowStart(now: Date) {
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, now.getUTCDate()) / 1000,
  );
}

/** Each subscription valued by its latest charge over its billing period. */
export function googlePlayMrr(charges: SaleCharge[], now: number) {
  const counted = subscriptionCharges(charges);
  const periodOf = learnPeriods(counted);
  const byCurrency: Record<string, number> = {};
  let customers = 0;
  let yearly = 0;
  for (const list of byChain(counted).values()) {
    const latest = list.at(-1)!;
    const known = periodOf(latest);
    const period = known ?? YEAR;
    if (now >= periodEnd(latest.at, period) + GRACE) continue;
    if (!known) yearly++;
    addTo(byCurrency, latest.currency, latest.amount / periodMonths(period));
    customers++;
  }
  return { byCurrency, customers, yearly, note: yearlyNote(yearly) };
}

/**
 * Service lines from the charges: each over its billing period, or until the subscription's next
 * charge where that comes earlier or a period later, give or take three days, so the lines meet.
 */
export function googlePlayServiceLines(charges: SaleCharge[]): ServiceLine[] {
  const counted = subscriptionCharges(charges);
  const periodOf = learnPeriods(counted);
  return [...byChain(counted).values()].flatMap((list) =>
    list.map((charge, index) => {
      const period = periodOf(charge) ?? YEAR;
      const next = list[index + 1];
      const end = periodEnd(charge.at, period);
      const meets = next !== undefined && Math.abs(next.at - end) <= 3 * DAY;
      return {
        start: charge.at,
        end: meets ? next.at : Math.min(end, next?.at ?? Infinity),
        currency: charge.currency,
        monthly: charge.amount / periodMonths(period),
      };
    }),
  );
}
