import "server-only";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchSubscriptions, fetchTransactions } from "./client";
import { parsePaddleKey } from "./key";
import { paddleMrr, paddleServiceLines, transactionWindowStart } from "./mrr";

/** Paddle Billing: MRR and history from subscriptions and their paid transactions. */
export const paddle: ProviderAdapter = {
  id: "paddle",
  parseKey: (input, options) => parsePaddleKey(input, options),
  async read(key, livemode, { now, history }) {
    const live = livemode ?? key.startsWith("pdl_live_");
    const subscriptions = await fetchSubscriptions(key, live);
    const recent = () => fetchTransactions(key, live, transactionWindowStart(subscriptions, now));
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
};
