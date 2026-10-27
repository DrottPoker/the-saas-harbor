import "server-only";
import { VerificationError } from "../errors";
import { ProviderRequestError } from "../http";
import { addDays, dayOf, dayStart } from "../payments";
import type { ListedPayment, ProviderAdapter } from "../types";
import {
  canReadCertificates,
  canReadReviews,
  fetchDailyReport,
  fetchFirstApp,
  UnknownVendorError,
} from "./client";
import { appStoreCredentials, parseAppStoreKey, type AppStoreCredentials } from "./key";
import {
  appStoreMrr,
  FRESH_DAYS,
  historyDates,
  recentDays,
  snapshotLines,
  type Snapshot,
} from "./mrr";
import { reportDays, salesPayments } from "./payments";

const BEYOND_REPORTS =
  "The key can do more than download reports, such as managing apps, certificates or reviews. Create a Team key with the Sales role and access to reports, or with the Finance role.";

/**
 * Refuses a key whose role reaches beyond reports, every time it is used. Apple does not say what
 * a key may do, so this tries what the Sales and Finance roles may not: certificates, and the
 * reviews of an app of the team.
 */
async function requireReportsOnly(credentials: AppStoreCredentials) {
  if (await canReadCertificates(credentials)) throw new VerificationError(BEYOND_REPORTS);
  const app = await fetchFirstApp(credentials);
  if (app && (await canReadReviews(credentials, app))) throw new VerificationError(BEYOND_REPORTS);
}

/**
 * The subscription report of a day, or null when there is none. Apple gives the same answer to a
 * vendor without subscription reports as to a vendor number that is not the team's, so the first
 * such answer is checked against the day's sales report, which refuses a wrong number.
 */
function subscriptionReports(credentials: AppStoreCredentials) {
  let vendorKnown = false;
  return async (date: string) => {
    try {
      return await fetchDailyReport(credentials, "SUBSCRIPTION", date);
    } catch (error) {
      if (!(error instanceof UnknownVendorError)) throw error;
      if (!vendorKnown) await fetchDailyReport(credentials, "SALES", date);
      vendorKnown = true;
      return null;
    }
  };
}

/**
 * The latest subscription report of the last week, or null when there is none, as for a team
 * without active subscriptions. A latest report older than a few days means Apple has not
 * published the recent ones, which is not a fall to nothing.
 */
async function latestReport(
  report: (date: string) => Promise<Snapshot["rows"] | null>,
  now: Date,
): Promise<Snapshot | null> {
  for (const [back, date] of recentDays(now).entries()) {
    const rows = await report(date);
    if (!rows) continue;
    if (back >= FRESH_DAYS)
      throw new ProviderRequestError(
        "Apple has not published the subscription reports of the last few days. Try again later.",
      );
    return { date, rows };
  }
  return null;
}

/**
 * The App Store, through an App Store Connect API key that can only download reports: MRR from
 * the latest daily subscription report, the history from those of each month-end and 30 days ago,
 * and revenue from the daily sales reports. One vendor number verifies one product.
 */
export const appstore: ProviderAdapter = {
  id: "appstore",
  parseKey: (input) => parseAppStoreKey(input),
  async read(stored, _livemode, { now, history }) {
    const credentials = appStoreCredentials(stored);
    await requireReportsOnly(credentials);
    const report = subscriptionReports(credentials);
    const latest = await latestReport(report, now);
    let lines = null;
    if (history) {
      const snapshots = latest ? [latest] : [];
      for (const date of historyDates(now, latest?.date ?? dayOf(now.getTime() / 1000))) {
        const rows = await report(date);
        if (rows) snapshots.push({ date, rows });
      }
      lines = snapshotLines(credentials.vendor, snapshots, latest?.date ?? null, now);
    }
    return {
      livemode: true,
      ...appStoreMrr(credentials.vendor, latest?.rows ?? []),
      lines,
      historyNote: null,
    };
  },
  // Days before the first one Apple still keeps cannot be read, so a read that reaches it is
  // complete. Each day is one request.
  async payments(stored, _livemode, { since, before, maxPages }) {
    const credentials = appStoreCredentials(stored);
    await requireReportsOnly(credentials);
    const days = reportDays(since, before, new Date());
    const payments: ListedPayment[] = [];
    for (const [index, day] of days.entries()) {
      const unfinished = { payments, complete: false, from: dayStart(addDays(day, 1)) };
      if (index >= maxPages) return unfinished;
      let rows;
      try {
        rows = await fetchDailyReport(credentials, "SALES", day);
      } catch (error) {
        // Apple limits requests per key and hour; the days read so far still count.
        if (index > 0 && error instanceof ProviderRequestError && error.status === 429)
          return unfinished;
        throw error;
      }
      if (rows) payments.push(...salesPayments(credentials.vendor, day, rows));
    }
    return { payments, complete: true };
  },
};
