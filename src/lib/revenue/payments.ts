// Revenue from payments: every paid payment, subscription or one-time, after discounts, less
// refunds, before tax and the provider's fees, dated by the UTC day it was paid. Days and windows
// of days, how far a read of payments reaches, and revenue by month. Pure functions.
import { monthEnds } from "./history";
import { toUsdCents } from "./money";
import type { PaymentKind, PaymentRead } from "./types";

const DAY = 86_400;

/** The first day stored, in effect: a read that reaches the account's first payment covers it. */
export const FIRST_DAY = "1970-01-01";

/** Payments are listed again this many days back on every read, which picks up late refunds. */
export const REREAD_DAYS = 183;

/** The UTC day of a Unix time, as YYYY-MM-DD. */
export function dayOf(at: number) {
  return new Date(at * 1000).toISOString().slice(0, 10);
}

/** The Unix time a UTC day starts. */
export function dayStart(day: string) {
  return Date.parse(`${day}T00:00:00Z`) / 1000;
}

export function addDays(day: string, days: number) {
  return dayOf(dayStart(day) + days * DAY);
}

/** The first day listed again on every read. */
export function rereadFrom(now: Date) {
  return addDays(dayOf(now.getTime() / 1000), -REREAD_DAYS);
}

/**
 * The first day of each window the figures cover, up to and including today: the last 30 days,
 * and the last 12 months, from the day after the same date a year ago.
 */
export function revenueWindows(now: Date) {
  const today = dayOf(now.getTime() / 1000);
  const year = now.getUTCFullYear() - 1;
  const month = now.getUTCMonth();
  // The 29th of February a year back is the 28th.
  const day = Math.min(now.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  const yearAgo = dayOf(Date.UTC(year, month, day) / 1000);
  return { days30: addDays(today, -29), months12: addDays(yearAgo, 1) };
}

/**
 * The months of revenue by month, the same as the MRR history's: the twelve calendar months before
 * the current one, oldest first. `from` is the first day of the oldest, `to` the first day of the
 * current month.
 */
export function revenueMonths(now: Date) {
  const months = monthEnds(now).map(({ month }) => month);
  return {
    months,
    from: `${months[0]}-01`,
    to: dayOf(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000),
  };
}

/** A month of revenue in USD cents, with what subscriptions and one-time purchases paid of it. */
export type RevenueMonth = {
  month: string;
  cents: number;
  subscription_cents?: number;
  one_time_cents?: number;
};

/** Each month's totals per kind (payments without a kind under `unknown`) and currency. */
export type MonthTotals = Record<string, Partial<Record<PaymentKind, Record<string, number>>>>;

/**
 * The months from `from` (a first day) on, with each month's revenue in USD cents. A month whose
 * payments all have a kind is split into subscriptions and one-time purchases, and its revenue is
 * their sum; a month with any payment of unknown kind has its total only.
 */
export function revenueHistory(
  months: string[],
  from: string,
  totals: MonthTotals,
  rates: ReadonlyMap<string, number>,
): RevenueMonth[] {
  return months
    .filter((month) => `${month}-01` >= from)
    .map((month) => {
      const kinds = totals[month] ?? {};
      const unknown = Object.values(kinds.unknown ?? {}).some((amount) => amount > 0);
      if (unknown) {
        const all: Record<string, number> = {};
        for (const byCurrency of Object.values(kinds))
          for (const [currency, amount] of Object.entries(byCurrency ?? {}))
            all[currency] = (all[currency] ?? 0) + amount;
        return { month, cents: toUsdCents(all, rates) };
      }
      const subscription = toUsdCents(kinds.subscription ?? {}, rates);
      const oneTime = toUsdCents(kinds.one_time ?? {}, rates);
      return {
        month,
        cents: subscription + oneTime,
        subscription_cents: subscription,
        one_time_cents: oneTime,
      };
    });
}

/**
 * The first day a read of the days before `before` covers completely: `since` when it was read to
 * the end, or the day it says it covers from. A list read newest first stops somewhere in its
 * oldest day, whose earlier payments the next page would hold, so that day is left for the next
 * read. Null when it covers no whole day.
 */
export function coveredFrom(read: PaymentRead, since: string, before: string) {
  if (read.complete) return since;
  let from: string;
  if (read.from !== undefined) from = dayOf(read.from + DAY - 1);
  else if (read.payments.length)
    from = addDays(dayOf(Math.min(...read.payments.map((payment) => payment.at))), 1);
  else return null;
  return from < before ? from : null;
}

/** What a payment earned after refunds, never below nothing. */
export function netOf(amount: number, refunded = 0) {
  return Math.max(0, amount - refunded);
}

/**
 * How far the stored payments reach: from `from` (or all time with `origin`) to `readAt`, and the
 * days of the payments in the months charted that were stored before kinds were read (`unsorted`,
 * `to` exclusive), or null.
 */
export type Coverage = {
  from: string | null;
  origin: boolean;
  readAt: string | null;
  unsorted?: { from: string; to: string } | null;
};

/** A day range of payments read completely: `to` is exclusive, or null for up to now. */
export type PaymentWindow = { from: string; to: string | null };

/**
 * What one run reads: the last six months listed again, which picks up refunds, then older
 * payments back from where the stored ones start, until the account's first payment. A read that
 * cannot list the six months in one go, such as the first read of a provider that values each
 * payment with a request, covers what it can and goes on in the next run, since stored payments
 * are not valued again. The stored payments still count where they reach the days listed now, and
 * older payments are then read too, so an account too large to list six months in one run still
 * gets back to its first payment; otherwise there is a gap, and older payments are read again.
 * Once they reach the first payment, the payments of the months charted that were stored before
 * kinds were read are read again instead, so each gets its kind.
 * Returns the windows read completely, the payments listed, and how far the payments then reach,
 * or null when the read covers no whole day. The payments include those of a day a read did not
 * finish: storing them spares valuing them again, while the day stays outside the windows, so
 * nothing is removed from it and it counts only once it is read in full.
 */
export async function collectPayments(
  stored: Coverage,
  now: Date,
  read: (since: string, before: string | null, maxPages: number) => Promise<PaymentRead>,
  pages: { recent: number; older: number },
) {
  const reread = rereadFrom(now);
  const recent = await read(reread, null, pages.recent);
  const recentFrom = coveredFrom(recent, reread, addDays(dayOf(now.getTime() / 1000), 1));
  if (recentFrom === null) return null;
  const windows: PaymentWindow[] = [{ from: recentFrom, to: null }];
  const listed = [...recent.payments];
  const { from: storedFrom, readAt } = stored;
  const joins =
    storedFrom !== null && readAt !== null && recentFrom <= dayOf(Date.parse(readAt) / 1000);
  let from = joins && storedFrom < recentFrom ? storedFrom : recentFrom;
  let origin = joins && stored.origin;
  if ((recent.complete || joins) && !origin) {
    const older = await read(FIRST_DAY, from, pages.older);
    listed.push(...older.payments);
    const covered = coveredFrom(older, FIRST_DAY, from);
    if (covered !== null) {
      windows.push({ from: covered, to: from });
      from = covered;
      origin = older.complete;
    }
  } else if (origin && stored.unsorted) {
    // The recent read gives the kinds of the payments it lists.
    const since = stored.unsorted.from;
    const before = stored.unsorted.to < recentFrom ? stored.unsorted.to : recentFrom;
    if (since < before) {
      const again = await read(since, before, pages.older);
      listed.push(...again.payments);
      const covered = coveredFrom(again, since, before);
      if (covered !== null) windows.push({ from: covered, to: before });
    }
  }
  return { windows, listed, from, origin };
}
