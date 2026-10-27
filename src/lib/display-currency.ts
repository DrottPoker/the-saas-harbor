import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { LOCALE_INFO } from "@/i18n/config";
import { CURRENCIES, CURRENCY_COOKIE, type Currency } from "@/i18n/currencies";
import { detectCurrency, savedCurrency } from "@/i18n/detect";
import { usdMoney, type Money } from "./display-money";
import { displayRates } from "./revenue/fx";

/**
 * The currency the visitor asked for: their choice from the menu, else the one of the country the
 * host finds for their IP address, else USD.
 */
export const wantedCurrency = cache(async (): Promise<Currency> => {
  const [jar, list] = await Promise.all([cookies(), headers()]);
  return (
    savedCurrency(jar.get(CURRENCY_COOKIE)?.value) ??
    detectCurrency(list.get("x-vercel-ip-country"), list.get("accept-language"))
  );
});

/**
 * How this request shows amounts: the visitor's currency at today's reference rate, in the page's
 * language. Without a rate, such as when the rates cannot be read, amounts stay in USD.
 */
export const getMoney = cache(async (): Promise<Money> => {
  const [locale, currency] = await Promise.all([getLocale(), wantedCurrency()]);
  const intl = LOCALE_INFO[locale].intl;
  if (currency === "USD") return usdMoney(intl);
  const rates = await displayRates(CURRENCIES);
  const rate = rates?.rates.get(currency.toLowerCase());
  if (!rates || !rate) return usdMoney(intl);
  return { currency, rate, date: rates.date, locale: intl };
});
