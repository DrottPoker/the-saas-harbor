import "server-only";
import { splitAccountKey } from "../account-key";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import {
  fetchSubscriptionPayments,
  fetchToken,
  fetchTransactions,
  requireReadOnly,
  searchStart,
  type PayPalCredentials,
} from "./client";
import { parsePayPalKey } from "./key";
import {
  mrrWindowStart,
  paypalMrr,
  paypalServiceLines,
  subscriptionCharges,
  type SubscriptionCharge,
} from "./mrr";
import { paypalPayments } from "./payments";

function credentials(stored: string): PayPalCredentials {
  const { account, key } = splitAccountKey(stored);
  return { clientId: account, secret: key };
}

/**
 * A token that can only search transactions, checked every time. A new app is tried as a live one
 * first, and in the sandbox where test apps are allowed.
 */
async function authorize(stored: string, livemode: boolean | null, allowTest: boolean) {
  const app = credentials(stored);
  let live = livemode ?? true;
  let issued;
  try {
    issued = await fetchToken(app, live);
  } catch (error) {
    if (livemode !== null || !allowTest) throw error;
    if (!(error instanceof ProviderRequestError && error.status === 401)) throw error;
    live = false;
    issued = await fetchToken(app, live);
  }
  requireReadOnly(issued.scopes);
  return { token: issued.token, live };
}

/**
 * PayPal, through an app of the founder's that can only search transactions: MRR and history from
 * the payments of subscriptions, and revenue from every payment from customers, less refunds.
 */
export const paypal: ProviderAdapter = {
  id: "paypal",
  parseKey: (input) => parsePayPalKey(input),
  async read(stored, livemode, { allowTest, now, history }) {
    const { token, live } = await authorize(stored, livemode, allowTest);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const mrrFrom = mrrWindowStart(now);
    const read = async (since: number) =>
      subscriptionCharges(await fetchSubscriptionPayments(token, live, since, nowSeconds));
    let charges: SubscriptionCharge[];
    let historyNote: string | null = null;
    if (!history) charges = await read(mrrFrom);
    else
      try {
        charges = await read(historyWindowStart(now));
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        charges = await read(mrrFrom);
        historyNote =
          "The PayPal account has more subscription payments than one verification reads, so there is no revenue history.";
      }
    return {
      livemode: live,
      // The same payments as an hourly read, so MRR does not depend on whether history was read.
      ...paypalMrr(
        charges.filter((charge) => charge.at >= mrrFrom),
        nowSeconds,
      ),
      lines: history && !historyNote ? paypalServiceLines(charges) : null,
      historyNote,
    };
  },
  // Payments before PayPal's three years cannot be listed, so a read that reaches them is complete.
  async payments(stored, livemode, { allowTest, since, before, maxPages }) {
    const { token } = await authorize(stored, livemode, allowTest);
    const now = Math.floor(Date.now() / 1000);
    const from = Math.max(since, searchStart(now));
    const end = before ?? now;
    if (end <= from) return { payments: [], complete: true };
    const read = await fetchTransactions(token, livemode, { since: from, before: end, maxPages });
    const payments = paypalPayments(read.transactions).filter(
      (payment) => payment.at >= since && (before === null || payment.at < before),
    );
    return read.complete
      ? { payments, complete: true }
      : { payments, complete: false, from: read.from };
  },
};
