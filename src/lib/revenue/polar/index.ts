import "server-only";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchOrders, fetchOrganization, fetchSubscriptions } from "./client";
import { parsePolarToken } from "./key";
import { meteredPrices, orderWindowStart, polarMrr, polarServiceLines } from "./mrr";

/**
 * The environment a token belongs to. Sandbox and production tokens look alike, so a new token is
 * tried on production first, and on the sandbox where test keys are allowed.
 */
async function environment(key: string, livemode: boolean | null, allowTest: boolean) {
  if (livemode !== null) return livemode;
  try {
    await fetchOrganization(key, true);
    return true;
  } catch (error) {
    if (!allowTest || !(error instanceof ProviderRequestError && error.status === 401)) throw error;
    await fetchOrganization(key, false);
    return false;
  }
}

/** Polar: MRR from subscriptions, with tax and history from their paid orders. */
export const polar: ProviderAdapter = {
  id: "polar",
  parseKey: (input) => parsePolarToken(input),
  async read(key, livemode, { allowTest, now }) {
    const live = await environment(key, livemode, allowTest);
    const subscriptions = await fetchSubscriptions(key, live);
    let orders;
    let historyNote: string | null = null;
    try {
      orders = await fetchOrders(key, live, historyWindowStart(now));
    } catch (error) {
      if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
      orders = await fetchOrders(key, live, orderWindowStart(subscriptions, now));
      historyNote =
        "The Polar account has more orders than one verification reads, so there is no revenue history.";
    }
    return {
      livemode: live,
      ...polarMrr(subscriptions, orders),
      lines: historyNote ? null : polarServiceLines(orders, meteredPrices(subscriptions)),
      historyNote,
    };
  },
};
