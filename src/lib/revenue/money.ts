// Money and billing intervals, shared by every payment provider. Pure functions.
import { VerificationError } from "./errors";

export type Interval = "day" | "week" | "month" | "year";

/** Days in an average month, for daily and weekly prices in the MRR and the history alike. */
export const AVERAGE_MONTH_DAYS = 365.25 / 12;

/** Months covered by `count` billing intervals. */
export function intervalMonths(interval: Interval, count = 1) {
  return {
    day: count / AVERAGE_MONTH_DAYS,
    week: (count * 7) / AVERAGE_MONTH_DAYS,
    month: count,
    year: count * 12,
  }[interval];
}

const DAY = 86_400;

/** The same instant `months` calendar months later, on the last day where the month is shorter. */
function addMonths(seconds: number, months: number) {
  const date = new Date(seconds * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const time = seconds * 1000 - Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  return (Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)) + time) / 1000;
}

/**
 * Months in a service period (Unix seconds). A period that ends within a day of the same date a
 * whole number of months later counts as those months, so a monthly charge covers one month in
 * February as in March; any other period counts by the average month.
 */
export function periodMonths(start: number, end: number) {
  const byDays = (end - start) / DAY / AVERAGE_MONTH_DAYS;
  const whole = Math.round(byDays);
  if (whole >= 1 && Math.abs(addMonths(start, whole) - end) <= DAY) return whole;
  return byDays;
}

// Minor units per major unit (ISO 4217), as the providers count amounts.
const ZERO_DECIMAL = new Set(
  "bif clp djf gnf jpy kmf krw mga pyg rwf ugx vnd vuv xaf xof xpf".split(" "),
);
const THREE_DECIMAL = new Set("bhd jod kwd omr tnd".split(" "));
export function minorUnitsPerMajor(currency: string) {
  const code = currency.toLowerCase();
  return ZERO_DECIMAL.has(code) ? 1 : THREE_DECIMAL.has(code) ? 1000 : 100;
}

/** Minor units from an amount in major units, such as "10.00" or 10 for ten dollars. */
export function toMinorUnits(amount: string | number, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new VerificationError("An amount could not be read.");
  return value * minorUnitsPerMajor(currency);
}

/** Adds an amount in minor units to a per-currency total, keyed by lowercase currency. */
export function addTo(totals: Record<string, number>, currency: string, amount: number) {
  const code = currency.toLowerCase();
  totals[code] = (totals[code] ?? 0) + amount;
}

/**
 * Converts per-currency MRR to whole USD cents. `rates` maps a lowercase currency code to units
 * of that currency per 1 USD, which is the shape the exchange-rate source returns for base USD.
 */
export function toUsdCents(byCurrency: Record<string, number>, rates: ReadonlyMap<string, number>) {
  let usd = 0;
  for (const [currency, minor] of Object.entries(byCurrency)) {
    const rate = currency === "usd" ? 1 : rates.get(currency);
    if (!rate) throw new VerificationError(`No exchange rate for ${currency.toUpperCase()}.`);
    usd += minor / minorUnitsPerMajor(currency) / rate;
  }
  return Math.round(usd * 100);
}
