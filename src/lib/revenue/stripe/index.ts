import "server-only";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchPaidInvoices, fetchStripeAccountData } from "./client";
import { serviceLines } from "./history";
import { parseRestrictedKey } from "./key";
import { calculateMrr } from "./mrr";

// History is extra. MRR verifies without it when the key cannot read invoices or prices, or when
// the account has more invoices than one run reads; the maker gets a note saying which.
async function invoiceHistory(key: string, now: Date) {
  try {
    const { invoices, prices } = await fetchPaidInvoices(key, historyWindowStart(now));
    return { lines: serviceLines(invoices, prices), note: null };
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 403)
      return {
        lines: null,
        note: `Revenue history needs the ${error.path?.startsWith("/v1/prices") ? "Prices" : "Invoices"}: Read permission on the restricted key.`,
      };
    if (error instanceof ProviderRequestError && error.tooMuchData)
      return {
        lines: null,
        note: "The Stripe account has more invoices than one verification reads, so there is no revenue history.",
      };
    throw error;
  }
}

/** Stripe: subscription MRR from a restricted key, and history from paid invoices. */
export const stripe: ProviderAdapter = {
  id: "stripe",
  parseKey: (input, options) => parseRestrictedKey(input, options),
  async read(key, livemode, { now }) {
    const { subscriptions, coupons } = await fetchStripeAccountData(key);
    const mrr = calculateMrr(subscriptions, coupons, Math.floor(now.getTime() / 1000));
    const { lines, note } = await invoiceHistory(key, now);
    return {
      livemode: livemode ?? key.startsWith("rk_live_"),
      ...mrr,
      lines,
      historyNote: note,
    };
  },
};
