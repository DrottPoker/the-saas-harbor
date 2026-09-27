import "server-only";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchOrders, fetchOrganization, fetchPaidOrders, fetchSubscriptions } from "./client";
import { parsePolarToken } from "./key";
import { meteredPrices, orderWindowStart, polarMrr, polarServiceLines } from "./mrr";
import { orderPayments } from "./payments";

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

/**
 * Polar: MRR from subscriptions, with tax and history from their paid orders, and revenue from
 * every paid order.
 */
export const polar: ProviderAdapter = {
  id: "polar",
  parseKey: ({ key }) => parsePolarToken(key),
  async read(key, livemode, { allowTest, now, history }) {
    const live = await environment(key, livemode, allowTest);
    const subscriptions = await fetchSubscriptions(key, live);
    const recent = () => fetchOrders(key, live, orderWindowStart(subscriptions, now));
    let orders;
    let historyNote: string | null = null;
    if (!history) orders = await recent();
    else
      try {
        orders = await fetchOrders(key, live, historyWindowStart(now));
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        orders = await recent();
        historyNote =
          "The Polar account has more orders than one verification reads, so there is no revenue history.";
      }
    return {
      livemode: live,
      ...polarMrr(subscriptions, orders),
      lines:
        history && !historyNote ? polarServiceLines(orders, meteredPrices(subscriptions)) : null,
      historyNote,
    };
  },
  async payments(key, livemode, { since, before, maxPages }) {
    const { items, complete } = await fetchPaidOrders(key, livemode, since, before, maxPages);
    return { payments: orderPayments(items), complete };
  },
};
