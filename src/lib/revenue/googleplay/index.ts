import "server-only";
import { historyWindowStart } from "../history";
import { ProviderRequestError, tooMuchData } from "../http";
import type { ProviderAdapter } from "../types";
import { downloadReport, fetchToken, listSalesReports, type ReportFile } from "./client";
import { parseGooglePlayKey, storedConnection, type GooglePlayConnection } from "./key";
import { googlePlayMrr, googlePlayServiceLines, mrrWindowStart, saleCharges } from "./mrr";
import { googlePlayPayments } from "./payments";
import {
  decodeText,
  MAX_CSV_BYTES,
  monthOf,
  monthStart,
  nextMonth,
  saleRows,
  uniqueRows,
  unzipCsv,
  type SaleRow,
} from "./report";

const NAME = "Google Play";
/** The most compressed report data one read downloads, so a huge account cannot stall a run. */
export const MAX_READ_BYTES = 32 * 1024 * 1024;

/** The rows of report files for the connection's packages, each row once. */
async function readReports(token: string, connection: GooglePlayConnection, files: ReportFile[]) {
  const rows: SaleRow[] = [];
  for (const file of files) {
    const zip = await downloadReport(token, connection.bucket, file);
    for (const csv of unzipCsv(zip, MAX_CSV_BYTES, file.name))
      for (const row of saleRows(decodeText(csv), connection.packages)) rows.push(row);
  }
  return uniqueRows(rows);
}

const sizeOf = (files: ReportFile[]) => files.reduce((sum, file) => sum + file.size, 0);

/** The reports from the month of `from` on, or too much data when they are too large to read. */
function reportsFrom(files: ReportFile[], from: number) {
  const first = monthOf(from);
  const chosen = files.filter((file) => file.month >= first);
  if (sizeOf(chosen) > MAX_READ_BYTES) throw tooMuchData(NAME, "sales/");
  return chosen;
}

function missingNote(missing: string[]) {
  if (!missing.length) return null;
  return missing.length === 1
    ? `Google Play's reports of the last 13 months have no sales of ${missing[0]}. Check the package name.`
    : `Google Play's reports of the last 13 months have no sales of ${missing.join(", ")}. Check the package names.`;
}

/**
 * Google Play, through a service account that can view the developer account's financial reports:
 * MRR, history and revenue from the monthly estimated sales reports in its Cloud Storage bucket,
 * for the apps the founder names. One app verifies one product, so each package seen in the
 * reports is claimed.
 */
export const googleplay: ProviderAdapter = {
  id: "googleplay",
  parseKey: (input) => parseGooglePlayKey(input),
  async read(stored, _livemode, { now, history }) {
    const connection = storedConnection(stored);
    const token = await fetchToken(connection.account);
    const files = await listSalesReports(token, connection.bucket);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const mrrFrom = mrrWindowStart(now);
    let rows: SaleRow[];
    let historyNote: string | null = null;
    if (!history) rows = await readReports(token, connection, reportsFrom(files, mrrFrom));
    else
      try {
        rows = await readReports(token, connection, reportsFrom(files, historyWindowStart(now)));
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        rows = await readReports(token, connection, reportsFrom(files, mrrFrom));
        historyNote =
          "The Google Play sales reports of the last 25 months are larger than one verification reads, so there is no revenue history.";
      }
    const { charges, unreadable } = saleCharges(rows);
    // The same charges as an hourly read, so MRR does not depend on whether history was read.
    const mrr = googlePlayMrr(
      charges.filter((charge) => charge.at >= mrrFrom),
      nowSeconds,
    );
    const seen = new Set(rows.filter((row) => row.at >= mrrFrom).map((row) => row.packageName));
    const notes = [
      mrr.note,
      missingNote(connection.packages.filter((name) => !seen.has(name.toLowerCase()))),
    ].filter(Boolean);
    return {
      livemode: true,
      byCurrency: mrr.byCurrency,
      customers: mrr.customers,
      subscriptionIds: [...seen].sort().map((name) => `package:${name}`),
      skippedItems: unreadable.filter((charge) => charge.at >= mrrFrom).length,
      mrrNote: notes.length ? notes.join(" ") : null,
      lines: history && !historyNote ? googlePlayServiceLines(charges) : null,
      historyNote,
    };
  },
  /**
   * Each report file is a page. The window's months are read newest first, then the month after
   * it where the budget allows, for refunds made soon after; a read that stops covers the window
   * from the first day of its oldest month read.
   */
  async payments(stored, _livemode, { since, before, maxPages }) {
    const connection = storedConnection(stored);
    const token = await fetchToken(connection.account);
    const files = await listSalesReports(token, connection.bucket);
    const end = before ?? Math.floor(Date.now() / 1000);
    if (end <= since) return { payments: [], complete: true };
    const [first, last] = [monthOf(since), monthOf(end - 1)];
    const months = [...new Set(files.map((file) => file.month))]
      .filter((month) => month >= first && month <= last)
      .sort()
      .reverse();
    const rows: SaleRow[] = [];
    let requests = 0;
    let bytes = 0;
    const result = (complete: boolean, from?: number) => {
      const payments = googlePlayPayments(saleCharges(uniqueRows(rows)).charges, since, before);
      return complete ? { payments, complete } : { payments, complete, from };
    };
    let from = end;
    for (const month of months) {
      const monthFiles = files.filter((file) => file.month === month);
      const size = sizeOf(monthFiles);
      if (requests + monthFiles.length > maxPages || (requests && bytes + size > MAX_READ_BYTES))
        return result(false, from);
      for (const row of await readReports(token, connection, monthFiles)) rows.push(row);
      requests += monthFiles.length;
      bytes += size;
      from = monthStart(month);
    }
    const later = files.filter((file) => file.month === nextMonth(last));
    if (
      later.length &&
      requests + later.length <= maxPages &&
      bytes + sizeOf(later) <= MAX_READ_BYTES
    )
      for (const row of await readReports(token, connection, later)) rows.push(row);
    return result(true);
  },
};
