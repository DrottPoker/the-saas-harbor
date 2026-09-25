import "server-only";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchBrands, fetchLatestPayment, fetchSubscriptions } from "./client";
import { parseDodoKey } from "./key";
import { dodoMrr, taxIncludedSubscriptions, untaxedShare } from "./mrr";

// Each tax-inclusive subscription costs two requests, and Dodo allows 240 a minute per business.
const MAX_TAX_LOOKUPS = 200;

/** The environment of a new key: live first, then test where test keys are allowed. */
async function environment(key: string, livemode: boolean | null, allowTest: boolean) {
  if (livemode !== null) return livemode;
  try {
    await fetchBrands(key, true);
    return true;
  } catch (error) {
    if (!allowTest || !(error instanceof ProviderRequestError && error.status === 401)) throw error;
    await fetchBrands(key, false);
    return false;
  }
}

/**
 * Dodo Payments: MRR from subscriptions. Payments do not say which period they cover, so there
 * is no history.
 */
export const dodo: ProviderAdapter = {
  id: "dodo",
  parseKey: (input) => parseDodoKey(input),
  async read(key, livemode, { allowTest, now, history }) {
    const live = await environment(key, livemode, allowTest);
    const subscriptions = await fetchSubscriptions(key, live);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const inclusive = taxIncludedSubscriptions(subscriptions, nowSeconds);
    if (inclusive.length > MAX_TAX_LOOKUPS)
      throw new ProviderRequestError(
        "The Dodo Payments account has more tax-inclusive subscriptions than one verification reads.",
        undefined,
        "/payments",
        true,
      );
    const untaxed = new Map<string, number>();
    for (const id of inclusive) {
      const payment = await fetchLatestPayment(key, live, id);
      if (payment) untaxed.set(id, untaxedShare(payment));
    }
    return {
      livemode: live,
      ...dodoMrr(subscriptions, untaxed, nowSeconds),
      lines: null,
      historyNote: history
        ? "Dodo Payments does not say which period a payment covers, so there is no revenue history."
        : null,
    };
  },
};
