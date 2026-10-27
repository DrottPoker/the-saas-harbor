// Amounts as a visitor sees them: stored USD cents, converted at a daily reference rate into the
// visitor's currency and written the way their language writes money. Pure, for the server and
// the browser alike; `getMoney()` in `display-currency.ts` picks the currency and rate.
import { BASE_CURRENCY, type Currency } from "@/i18n/currencies";

export type Money = {
  /** The currency amounts are shown in. */
  currency: Currency;
  /** Units of that currency per US dollar; 1 for USD. */
  rate: number;
  /** The day of the reference rate, YYYY-MM-DD; null for USD. */
  date: string | null;
  /** The `Intl` locale that writes the amounts. */
  locale: string;
};

export function usdMoney(locale = "en-US"): Money {
  return { currency: BASE_CURRENCY, rate: 1, date: null, locale };
}

/** Whether amounts are converted from USD, which pages then say. */
export function isConverted(money: Money) {
  return money.currency !== BASE_CURRENCY;
}

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(locale: string, options: Intl.NumberFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    formatters.set(key, format);
  }
  return format;
}

/** The decimals a currency is written with, such as 2 for EUR and 0 for JPY. */
function minorDigits(currency: string) {
  return formatter("en-US", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits!;
}

type Style =
  /** As stored: cents when there are any. Converted amounts round to whole units from 100 up. */
  | "exact"
  /** Whole units, for figures reconstructed from history that are not accurate to the cent. */
  | "whole"
  /** Short, such as $4.2K, for chart axes. */
  | "compact";

/** An amount in USD cents as the visitor sees it. */
export function formatMoney(cents: number, money: Money, style: Style = "exact") {
  const amount = (cents / 100) * money.rate;
  const base = { style: "currency", currency: money.currency } as const;
  if (style === "compact")
    return formatter(money.locale, {
      ...base,
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  if (style === "whole")
    return formatter(money.locale, { ...base, maximumFractionDigits: 0 }).format(
      Math.round(amount),
    );
  if (!isConverted(money))
    return formatter(money.locale, {
      ...base,
      minimumFractionDigits: cents % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(amount);
  // A converted amount is only as exact as the rate, so cents would claim too much on large ones.
  const digits = Math.abs(amount) >= 100 ? 0 : minorDigits(money.currency);
  const rounded = Number(amount.toFixed(digits));
  return formatter(money.locale, {
    ...base,
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(rounded);
}

/** An amount in USD cents as US dollars, written in the visitor's language. */
export function formatUsdIn(cents: number, locale: string) {
  return formatMoney(cents, usdMoney(locale));
}

/** A whole number, such as a count of subscribers, written in the visitor's language. */
export function formatCount(value: number, locale: string) {
  return formatter(locale, {}).format(value);
}
