// Monthly recurring revenue from App Store Connect's daily subscription report (version 1_3).
// Pure functions: no I/O, fully testable.
// The report counts the auto-renewable subscriptions active at the end of a day, Pacific time, in
// rows by app, subscription, price, offer, country and device. MRR counts those at the standard
// price: each row's active standard price subscriptions at its customer price, over its standard
// duration, in the customer's currency. The customer price is what the App Store shows and
// charges, with VAT where it applies, which counts as charged. Free trials and marketing opt-ins
// pay nothing. Subscriptions on a paid introductory, promotional, offer code or win-back offer
// share a row with the standard price, so the report does not say what they pay: they are not
// counted, and are skipped. Billing retry and grace period are not paid periods. Like RevenueCat,
// MRR counts subscriptions rather than people. The history is the same count at each month-end
// and 30 days ago, each day's report standing for its day.
import { VerificationError } from "../errors";
import { monthEnds, type ServiceLine } from "../history";
import { addTo, intervalMonths, toMinorUnits, type Interval } from "../money";
import { addDays, dayOf, dayStart } from "../payments";

const DAY = 86_400;

/** A report row by column name, in lowercase with single spaces. */
export type ReportRow = Record<string, string>;

/** A day's subscription report: the Pacific day it counts, as YYYY-MM-DD, and its rows. */
export type Snapshot = { date: string; rows: ReportRow[] };

/** The byte order mark a file may start with. */
export const BOM = String.fromCharCode(0xfeff);

const columnName = (name: string) =>
  (name.startsWith(BOM) ? name.slice(1) : name).trim().toLowerCase().replace(/\s+/g, " ");

/** The rows of a tab-separated report, its first line naming the columns. */
export function parseReport(text: string): ReportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!lines.length) return [];
  const header = lines[0].split("\t").map(columnName);
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(header.map((name, index) => [name, (cells[index] ?? "").trim()]));
  });
}

/** Refuses a report without the columns read from it, rather than counting nothing. */
export function requireColumns(rows: ReportRow[], columns: string[]) {
  const missing = rows.length ? columns.filter((column) => !(column in rows[0])) : [];
  if (missing.length)
    throw new VerificationError(
      `An App Store report did not have the expected columns (${missing.join(", ")}).`,
    );
}

export const SUBSCRIPTION_COLUMNS = {
  app: "app apple id",
  duration: "standard subscription duration",
  price: "customer price",
  currency: "customer currency",
  standard: "active standard price subscriptions",
};

/** Count columns of subscriptions on a paid offer, whatever the kind of offer. */
const PAID_OFFER = /\b(pay up front|pay as you go)\b/;

const count = (value: string | undefined) => Math.max(0, Math.round(Number(value) || 0));

/** Months in a standard duration: 7 Days, 1 Month, 2 Months, 3 Months, 6 Months or 1 Year. */
export function durationMonths(value: string | undefined) {
  const match = /^(\d+)\s*(day|week|month|year)s?$/i.exec(value?.trim() ?? "");
  const length = Number(match?.[1]);
  if (!match || !length) return null;
  return intervalMonths(match[2].toLowerCase() as Interval, length);
}

/**
 * MRR per currency from a day's subscription report, with the subscriptions counted, those that
 * could not be valued, and the claims: the vendor, and each app with a counted subscription.
 */
export function appStoreMrr(vendor: string, rows: ReportRow[]) {
  const columns = SUBSCRIPTION_COLUMNS;
  requireColumns(rows, Object.values(columns));
  const byCurrency: Record<string, number> = {};
  const apps = new Set<string>();
  let customers = 0;
  let skippedItems = 0;
  for (const row of rows) {
    for (const [name, value] of Object.entries(row))
      if (PAID_OFFER.test(name)) skippedItems += count(value);
    const standard = count(row[columns.standard]);
    if (!standard) continue;
    const price = Number(row[columns.price]);
    // A subscription at no price pays nothing.
    if (Number.isFinite(price) && price <= 0) continue;
    const currency = row[columns.currency].toLowerCase();
    const months = durationMonths(row[columns.duration]);
    if (!Number.isFinite(price) || !months || !/^[a-z]{3}$/.test(currency)) {
      skippedItems += standard;
      continue;
    }
    addTo(byCurrency, currency, (standard * toMinorUnits(price, currency)) / months);
    customers += standard;
    if (row[columns.app]) apps.add(row[columns.app]);
  }
  return {
    byCurrency,
    customers,
    skippedItems,
    subscriptionIds: [`vendor:${vendor}`, ...[...apps].sort().map((app) => `app:${app}`)],
  };
}

/** Apple publishes a day's report the next morning, Pacific time; older ones count as stale. */
export const FRESH_DAYS = 3;

/** The days whose report may be the latest, newest first: the week before today (UTC). */
export function recentDays(now: Date) {
  const today = dayOf(now.getTime() / 1000);
  return Array.from({ length: 7 }, (_, back) => addDays(today, -back - 1));
}

/**
 * The days whose reports give the history: each month-end of the chart, and the day 30 days ago,
 * before `latest`, the day of the latest report, which stands for the days after it.
 */
export function historyDates(now: Date, latest: string) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const instants = [...monthEnds(now).map(({ at }) => at), nowSeconds - 30 * DAY];
  return [...new Set(instants.map(dayOf))].filter((day) => day < latest).sort();
}

/**
 * Service lines from the reports: each day's MRR over that UTC day, and the latest report's until
 * a day after `now`, so the MRR at a month-end, 30 days ago or now is that of its report.
 */
export function snapshotLines(
  vendor: string,
  snapshots: Snapshot[],
  latest: string | null,
  now: Date,
): ServiceLine[] {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return snapshots.flatMap(({ date, rows }) => {
    const start = dayStart(date);
    const end = date === latest ? Math.max(start + DAY, nowSeconds + DAY) : start + DAY;
    return Object.entries(appStoreMrr(vendor, rows).byCurrency).map(([currency, monthly]) => ({
      start,
      end,
      currency,
      monthly,
    }));
  });
}
