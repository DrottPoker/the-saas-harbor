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

// Minor units per major unit (ISO 4217), as the providers count amounts.
const ZERO_DECIMAL = new Set(
  "bif clp djf gnf jpy kmf krw mga pyg rwf ugx vnd vuv xaf xof xpf".split(" "),
);
const THREE_DECIMAL = new Set("bhd jod kwd omr tnd".split(" "));
export function minorUnitsPerMajor(currency: string) {
  const code = currency.toLowerCase();
  return ZERO_DECIMAL.has(code) ? 1 : THREE_DECIMAL.has(code) ? 1000 : 100;
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
