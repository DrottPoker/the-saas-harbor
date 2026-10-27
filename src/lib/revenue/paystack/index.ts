import "server-only";
import { historyWindowStart } from "../history";
import { MAX_PAGES, ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchPlans, fetchRefunds, fetchSubscriptions, fetchTransactions } from "./client";
import { parsePaystackKey } from "./key";
import {
  createdAt,
  paystackMrr,
  paystackServiceLines,
  planIndex,
  subscriptionPlans,
  subscriptionsFromPlans,
  unlistedNote,
  type PaystackPlan,
} from "./mrr";
import { paystackPayments, refundedStatus } from "./payments";

const DAY = 86_400;

/**
 * Transactions are listed by when they were created and dated by when they were paid, which can
 * be later, as for a bank transfer. A payment made up to this long after its transaction was
 * created is still read in its window.
 */
const PAYMENT_LAG = 2 * DAY;

/**
 * The subscriptions and their plans. Paystack does not say which scope lists subscriptions, so
 * where the key cannot, the plan list gives each plan's own.
 */
async function readSubscriptions(key: string, live: boolean) {
  try {
    const subscriptions = await fetchSubscriptions(key, live);
    return { subscriptions, plans: subscriptionPlans(subscriptions), unlisted: 0 };
  } catch (error) {
    if (!(error instanceof ProviderRequestError && error.status === 403)) throw error;
  }
  const plans = await fetchPlans(key, live);
  return { ...subscriptionsFromPlans(plans), plans: planIndex(plans) };
}

// History is extra. MRR verifies without it when the key cannot read transactions, or when the
// account has more successful transactions than one run reads; the maker gets a note saying which.
async function transactionHistory(
  key: string,
  live: boolean,
  now: Date,
  plans: ReadonlyMap<string, PaystackPlan>,
) {
  try {
    const { items, complete } = await fetchTransactions(key, live, {
      since: historyWindowStart(now),
      before: null,
      status: "success",
      maxPages: MAX_PAGES,
    });
    if (complete) return { lines: paystackServiceLines(items, plans), note: null };
    return {
      lines: null,
      note: "The Paystack account has more transactions than one verification reads, so there is no revenue history.",
    };
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 403)
      return {
        lines: null,
        note: "Revenue history needs the transactions:read scope on the restricted key.",
      };
    throw error;
  }
}

/**
 * Paystack, through a restricted key with read scopes: MRR from subscriptions, history from the
 * successful charges of plans, and revenue from every paid transaction, less refunds.
 */
export const paystack: ProviderAdapter = {
  id: "paystack",
  parseKey: ({ key }, options) => parsePaystackKey(key, options),
  async read(key, livemode, { now, history }) {
    const live = livemode ?? !key.startsWith("rk_test_");
    const { subscriptions, plans, unlisted } = await readSubscriptions(key, live);
    const { lines, note } = history
      ? await transactionHistory(key, live, now, plans)
      : { lines: null, note: null };
    return {
      livemode: live,
      ...paystackMrr(subscriptions, Math.floor(now.getTime() / 1000)),
      mrrNote: unlistedNote(unlisted),
      lines,
      historyNote: note,
    };
  },
  async payments(key, livemode, { since, before, maxPages }) {
    const read = await fetchTransactions(key, livemode, {
      since: since - PAYMENT_LAG,
      before,
      maxPages,
    });
    // Refunds come after the transaction they refund, and change its status.
    const refunds = read.items.some((transaction) => refundedStatus(transaction.status))
      ? await fetchRefunds(key, livemode, since - PAYMENT_LAG)
      : [];
    const payments = paystackPayments(read.items, refunds, since, before);
    if (read.complete) return { payments, complete: true };
    // The list runs newest first by creation, so it holds every payment made from its oldest
    // transaction's creation on, give or take the lag.
    const oldest = read.items.reduce(
      (min, transaction) => Math.min(min, createdAt(transaction) ?? Infinity),
      Infinity,
    );
    return Number.isFinite(oldest)
      ? { payments, complete: false, from: oldest + PAYMENT_LAG }
      : { payments, complete: false };
  },
};
