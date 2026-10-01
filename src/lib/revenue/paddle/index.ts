import "server-only";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchBilledTransactions, fetchSubscriptions, fetchTransactions } from "./client";
import { parsePaddleKey } from "./key";
import {
  paddleMrr,
  paddleServiceLines,
  recentWindowStart,
  transactionWindowStart,
  withoutFullCharge,
  type PaddleSubscription,
} from "./mrr";
import { transactionPayments } from "./payments";

/** Subscriptions whose charges one request asks for, and how many are looked up a run at most. */
const PER_REQUEST = 25;
const MAX_LOOKUPS = 1000;

/**
 * The transactions MRR needs: those of the last month and a few days, which hold the latest
 * charge of every monthly subscription, then the charges of the subscriptions without a full one
 * there, each back one billing cycle before its current period. One annual subscription no longer
 * widens the read for all of them to nearly two years. Past a thousand such subscriptions, one
 * window that holds every latest charge is read, as before.
 */
async function recentTransactions(
  key: string,
  live: boolean,
  subscriptions: PaddleSubscription[],
  now: Date,
) {
  const transactions = await fetchTransactions(key, live, recentWindowStart(now));
  const missing = withoutFullCharge(subscriptions, transactions);
  if (missing.length > MAX_LOOKUPS)
    return fetchTransactions(key, live, transactionWindowStart(subscriptions, now));
  for (let start = 0; start < missing.length; start += PER_REQUEST) {
    const batch = missing.slice(start, start + PER_REQUEST);
    transactions.push(
      ...(await fetchTransactions(
        key,
        live,
        transactionWindowStart(batch, now),
        batch.map((subscription) => subscription.id),
      )),
    );
  }
  return transactions;
}

/**
 * Paddle Billing: MRR and history from subscriptions and their paid transactions, and revenue
 * from every paid transaction.
 */
export const paddle: ProviderAdapter = {
  id: "paddle",
  parseKey: ({ key }, options) => parsePaddleKey(key, options),
  async read(key, livemode, { now, history }) {
    const live = livemode ?? key.startsWith("pdl_live_");
    const subscriptions = await fetchSubscriptions(key, live);
    const recent = () => recentTransactions(key, live, subscriptions, now);
    // Transactions for the history's 25 months hold the latest charges MRR needs as well. Without
    // the history, or for an account with more than one run reads, MRR reads only the charges it
    // needs.
    let transactions;
    let historyNote: string | null = null;
    if (!history) transactions = await recent();
    else
      try {
        transactions = await fetchTransactions(key, live, historyWindowStart(now));
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        transactions = await recent();
        historyNote =
          "The Paddle account has more transactions than one verification reads, so there is no revenue history.";
      }
    const mrr = paddleMrr(subscriptions, transactions, Math.floor(now.getTime() / 1000));
    return {
      livemode: live,
      ...mrr,
      lines: history && !historyNote ? paddleServiceLines(transactions) : null,
      historyNote,
    };
  },
  async payments(key, livemode, { since, before, maxPages }) {
    const { items, complete } = await fetchBilledTransactions(
      key,
      livemode,
      since,
      before,
      maxPages,
    );
    return { payments: transactionPayments(items), complete };
  },
};
