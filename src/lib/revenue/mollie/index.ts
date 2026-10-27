import "server-only";
import { splitAccountKey } from "../account-key";
import { historyWindowStart } from "../history";
import { MAX_PAGES, ProviderRequestError, tooMuchData } from "../http";
import { addDays, dayOf, dayStart } from "../payments";
import type { ProviderAdapter } from "../types";
import {
  fetchPayments,
  fetchPermissions,
  fetchSubscriptions,
  PAYMENTS,
  requireReadOnly,
  type MollieAccess,
} from "./client";
import { parseMollieKey } from "./key";
import {
  mollieMrr,
  mollieServiceLines,
  paidAheadWindowStart,
  type MolliePayment,
  type MollieSubscription,
} from "./mrr";
import { molliePayments } from "./payments";

/** The token and profile of a stored key, once Mollie confirms the token can only read. */
async function readOnlyToken(stored: string) {
  const { account: profile, key: token } = splitAccountKey(stored);
  requireReadOnly(await fetchPermissions(token));
  return { token, profile };
}

/**
 * The profile's subscriptions, and whether they are live. Where test keys are allowed and the
 * environment is not known yet, live data is tried first, and test data when Mollie refuses the
 * token live, as it does a token limited to test mode.
 */
async function subscriptionsOf(
  token: string,
  profile: string,
  livemode: boolean | null,
  allowTest: boolean,
): Promise<{ access: MollieAccess; subscriptions: MollieSubscription[] }> {
  const access = { token, profile, live: livemode ?? true };
  try {
    return { access, subscriptions: await fetchSubscriptions(access) };
  } catch (error) {
    if (livemode !== null || !allowTest) throw error;
    if (!(error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)))
      throw error;
    const test = { ...access, live: false };
    return { access: test, subscriptions: await fetchSubscriptions(test) };
  }
}

/** Every payment created since `since`, all of them or none. */
async function paymentsSince(access: MollieAccess, since: number) {
  const read = await fetchPayments(access, since, MAX_PAGES);
  if (!read.complete) throw tooMuchData("Mollie", PAYMENTS);
  return read.payments;
}

/**
 * Mollie, through an advanced access token that can only read: MRR from the active subscriptions
 * of one website profile, and history and revenue from its paid payments.
 */
export const mollie: ProviderAdapter = {
  id: "mollie",
  parseKey: (input, options) => parseMollieKey(input, options),
  async read(stored, livemode, { allowTest, now, history }) {
    const { token, profile } = await readOnlyToken(stored);
    const { access, subscriptions } = await subscriptionsOf(token, profile, livemode, allowTest);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    // MRR reads payments only for subscriptions that start later and may have been paid ahead.
    const aheadFrom = paidAheadWindowStart(subscriptions, nowSeconds);
    const recent = async () => (aheadFrom === null ? [] : paymentsSince(access, aheadFrom));
    let payments: MolliePayment[];
    let historyNote: string | null = null;
    if (!history) payments = await recent();
    else
      try {
        payments = await paymentsSince(access, historyWindowStart(now));
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        payments = await recent();
        historyNote =
          "The Mollie profile has more payments than one verification reads, so there is no revenue history.";
      }
    return {
      livemode: access.live,
      ...mollieMrr(subscriptions, payments, nowSeconds),
      lines: history && !historyNote ? mollieServiceLines(payments, subscriptions) : null,
      historyNote,
    };
  },
  async payments(stored, livemode, { since, before, maxPages }) {
    const { token, profile } = await readOnlyToken(stored);
    const read = await fetchPayments({ token, profile, live: livemode }, since, maxPages);
    const payments = molliePayments(read.payments, since, before);
    if (read.complete) return { payments, complete: true };
    // The list goes on within the oldest day it reached, which the next read finishes.
    if (read.oldest === null) return { payments, complete: false };
    return { payments, complete: false, from: dayStart(addDays(dayOf(read.oldest), 1)) };
  },
};
