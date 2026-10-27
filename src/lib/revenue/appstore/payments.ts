// Revenue from App Store Connect's daily sales reports (Summary Sales, version 1_0). Pure
// functions: no I/O, fully testable.
// A report holds a Pacific day's sales in rows by product, price, country and offer: units, which
// are negative for refunds and for credits towards a bundle, times the customer price per unit,
// also negative for those. The customer price includes VAT where it applies, which counts as
// charged. Each report day gives one payment per customer currency and kind, after its refunds and
// credits, so a refund Apple reports on a later day than the sale comes off that day's sales in
// the currency and never below nothing. Auto-renewable subscriptions (product types IAY and IAY-M)
// paid for a subscription; apps, in-app purchases and non-renewing subscriptions were one-time
// purchases. A row of zero units, such as a partial refund, cannot be valued and does not count.
import { minorUnitsPerMajor } from "../money";
import { addDays, dayOf, dayStart, netOf } from "../payments";
import type { ListedPayment, PaymentKind } from "../types";
import { requireColumns, type ReportRow } from "./mrr";

/** Product type identifiers of auto-renewable subscriptions, on iOS and visionOS, and on Mac. */
export const SUBSCRIPTION_TYPES = new Set(["IAY", "IAY-M"]);

export const SALES_COLUMNS = {
  type: "product type identifier",
  units: "units",
  price: "customer price",
  currency: "customer currency",
};

/**
 * Apple keeps daily reports for a year after they come out, the day after the day they report.
 * The first day still read is a day inside that year.
 */
export const REPORT_DAYS = 364;

export function firstReportDay(now: Date) {
  return addDays(dayOf(now.getTime() / 1000), -REPORT_DAYS);
}

/**
 * The report days of a window, newest first: from `since` (or the first day Apple still keeps)
 * to `before` (exclusive), and to yesterday at the latest, since a day's report comes out the
 * next day.
 */
export function reportDays(since: number, before: number | null, now: Date) {
  const today = dayStart(dayOf(now.getTime() / 1000));
  const first = Math.max(since, dayStart(firstReportDay(now)));
  const end = Math.min(before ?? today, today);
  const days: string[] = [];
  for (let start = end - 86_400; start >= first; start -= 86_400) days.push(dayOf(start));
  return days;
}

type Line = {
  currency: string;
  kind: PaymentKind;
  sold: number;
  taken: number;
  unitsSold: number;
  unitsTaken: number;
};

/** The payments of one report day of a vendor, `date` being the day as YYYY-MM-DD. */
export function salesPayments(vendor: string, date: string, rows: ReportRow[]): ListedPayment[] {
  const columns = SALES_COLUMNS;
  requireColumns(rows, Object.values(columns));
  const lines = new Map<string, Line>();
  for (const row of rows) {
    const units = Number(row[columns.units]);
    const price = Number(row[columns.price]);
    const currency = row[columns.currency].toLowerCase();
    if (!units || !price || !Number.isFinite(units * price) || !/^[a-z]{3}$/.test(currency))
      continue;
    const kind: PaymentKind = SUBSCRIPTION_TYPES.has(row[columns.type].toUpperCase())
      ? "subscription"
      : "one_time";
    const key = `${currency}:${kind}`;
    const line = lines.get(key) ?? {
      currency,
      kind,
      sold: 0,
      taken: 0,
      unitsSold: 0,
      unitsTaken: 0,
    };
    // Refunds and credits have negative units and a negative price.
    const amount = Math.abs(units * price) * minorUnitsPerMajor(currency);
    if (units < 0 || price < 0) {
      line.taken += amount;
      line.unitsTaken += Math.abs(units);
    } else {
      line.sold += amount;
      line.unitsSold += units;
    }
    lines.set(key, line);
  }
  return [...lines.values()]
    .filter((line) => line.sold > 0)
    .map((line) => ({
      id: `${vendor}:${date}:${line.currency}:${line.kind}`,
      at: dayStart(date),
      fingerprint: `${line.unitsSold}:${line.unitsTaken}:${Math.round(line.sold)}:${Math.round(line.taken)}`,
      value: { currency: line.currency, amount: netOf(line.sold, line.taken) },
      kind: line.kind,
    }));
}
