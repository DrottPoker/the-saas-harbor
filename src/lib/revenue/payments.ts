// Revenue from payments: every paid payment, subscription or one-time, after discounts, less
// refunds, before tax and the provider's fees, dated by the UTC day it was paid. Days and windows
// of days, and how far a read of payments reaches. Pure functions.
import type { ListedPayment, PaymentRead } from "./types";

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

/** Payments paid on or after a day. */
export function paymentsFrom(payments: ListedPayment[], day: string) {
  const start = dayStart(day);
  return payments.filter((payment) => payment.at >= start);
}

/** What a payment earned after refunds, never below nothing. */
export function netOf(amount: number, refunded = 0) {
  return Math.max(0, amount - refunded);
}

/** How far the stored payments reach: from `from` (or all time with `origin`) to `readAt`. */
export type Coverage = { from: string | null; origin: boolean; readAt: string | null };

/** A day range of payments read completely: `to` is exclusive, or null for up to now. */
export type PaymentWindow = { from: string; to: string | null };

/**
 * What one run reads: the last six months listed again, which picks up refunds, then, once they
 * are complete, older payments back from where the stored ones start, until the account's first
 * payment. A read that cannot list the six months in one go, such as the first read of a
 * provider that values each payment with a request, covers what it can and goes on in the next
 * run, since stored payments are not valued again. The stored payments still count where they
 * reach the days listed now; otherwise there is a gap, and older payments are read again.
 * Returns the windows read completely, their payments, and how far the payments then reach, or
 * null when the read covers no whole day.
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
  const listed = paymentsFrom(recent.payments, recentFrom);
  const { from: storedFrom, readAt } = stored;
  const joins =
    storedFrom !== null && readAt !== null && recentFrom <= dayOf(Date.parse(readAt) / 1000);
  let from = joins && storedFrom < recentFrom ? storedFrom : recentFrom;
  let origin = joins && stored.origin;
  if (recent.complete && !origin) {
    const older = await read(FIRST_DAY, from, pages.older);
    const covered = coveredFrom(older, FIRST_DAY, from);
    if (covered !== null) {
      windows.push({ from: covered, to: from });
      listed.push(...paymentsFrom(older.payments, covered));
      from = covered;
      origin = older.complete;
    }
  }
  return { windows, listed, from, origin };
}
