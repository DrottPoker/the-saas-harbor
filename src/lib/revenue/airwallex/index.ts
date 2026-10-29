import "server-only";
import { splitAccountKey } from "../account-key";
import { revenueText, VerificationError } from "../errors";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import { dayStart } from "../payments";
import type { ProviderAdapter } from "../types";
import {
  canRead,
  fetchInvoiceLines,
  fetchPaidInvoices,
  fetchPaymentIntents,
  fetchRefunds,
  fetchSubscriptionItems,
  fetchSubscriptions,
  fetchToken,
  OTHER_ACCESS,
  type AirwallexCredentials,
} from "./client";
import { parseAirwallexKey } from "./key";
import {
  airwallexMrr,
  airwallexServiceLines,
  countsNow,
  paidOutsideAirwallex,
  subscriptionInvoices,
  type AirwallexSubscriptionItem,
} from "./mrr";
import { airwallexPayments } from "./payments";

// Each subscription's items and each invoice's lines take a request of their own; these cap them
// in one run, so a large account cannot keep a check running.
const MAX_SUBSCRIPTIONS = 300;
const MAX_INVOICES = 300;
/** Airwallex has no payments from before it took them, so payments are read from here on. */
const FIRST_PAYMENT_DAY = "2016-01-01";
/** Invoices are read this far before the payments, so a late payment still finds its invoice. */
const INVOICE_LEAD = 400 * 86_400;

function credentials(stored: string): AirwallexCredentials {
  const { account, key } = splitAccountKey(stored);
  return { clientId: account, apiKey: key };
}

/**
 * Refuses a key that can read more than verification needs, every time it is used. Airwallex does
 * not say which scopes a key holds, and a write scope also allows the reads it covers, so a key
 * that can change subscriptions, invoices or payments cannot be told apart from one that reads
 * them; the editor asks for Read access only.
 */
async function requireNoOtherAccess(token: string, livemode: boolean) {
  for (const endpoint of OTHER_ACCESS)
    if (await canRead(token, livemode, endpoint))
      throw new VerificationError("airwallex.beyondAccess");
}

/**
 * A token for the key, after checking its access. A new key is tried in production first, and in
 * the sandbox where test keys are allowed.
 */
async function authorize(stored: string, livemode: boolean | null, allowTest: boolean) {
  const key = credentials(stored);
  let live = livemode ?? true;
  let token;
  try {
    token = await fetchToken(key, live);
  } catch (error) {
    if (livemode !== null || !allowTest) throw error;
    if (!(error instanceof ProviderRequestError && error.status === 401)) throw error;
    live = false;
    token = await fetchToken(key, live);
  }
  await requireNoOtherAccess(token, live);
  return { token, live };
}

function tooMany(key: "airwallex.tooManySubscriptions" | "airwallex.tooManyInvoices") {
  return new ProviderRequestError(key, {}, { tooMuchData: true });
}

/** Service lines from the paid subscription invoices since the history's window. */
async function readHistory(token: string, live: boolean, now: Date) {
  const invoices = subscriptionInvoices(
    await fetchPaidInvoices(token, live, historyWindowStart(now)),
  );
  if (invoices.length > MAX_INVOICES) throw tooMany("airwallex.tooManyInvoices");
  const lines = [];
  for (const invoice of invoices) lines.push(...(await fetchInvoiceLines(token, live, invoice.id)));
  return airwallexServiceLines(lines);
}

/**
 * Airwallex: MRR from Airwallex Billing's subscriptions and their items, history from the lines of
 * paid subscription invoices, and revenue from succeeded payment intents less refunds. A founder
 * who takes payments with Airwallex but bills elsewhere has no subscriptions here, so MRR is zero
 * and the founder is told, while revenue still counts every payment.
 */
export const airwallex: ProviderAdapter = {
  id: "airwallex",
  parseKey: (input) => parseAirwallexKey(input),
  async read(stored, livemode, { allowTest, now, history }) {
    const { token, live } = await authorize(stored, livemode, allowTest);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const subscriptions = [
      ...(await fetchSubscriptions(token, live, "ACTIVE")),
      ...(await fetchSubscriptions(token, live, "UNPAID")),
    ];
    const valued = subscriptions.filter(
      (subscription) => countsNow(subscription, nowSeconds) && !paidOutsideAirwallex(subscription),
    );
    if (valued.length > MAX_SUBSCRIPTIONS) throw tooMany("airwallex.tooManySubscriptions");
    const items = new Map<string, AirwallexSubscriptionItem[]>();
    for (const subscription of valued)
      items.set(subscription.id, await fetchSubscriptionItems(token, live, subscription.id));
    let lines = null;
    let historyNote: string | null = null;
    if (history)
      try {
        lines = await readHistory(token, live, now);
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        historyNote = revenueText("airwallex.historyTooLarge");
      }
    return {
      livemode: live,
      ...airwallexMrr(subscriptions, items, nowSeconds),
      lines,
      historyNote,
    };
  },
  async payments(stored, livemode, { allowTest, since, before, maxPages }) {
    const { token } = await authorize(stored, livemode, allowTest);
    const now = Math.floor(Date.now() / 1000);
    const from = Math.max(since, dayStart(FIRST_PAYMENT_DAY));
    const end = before ?? now;
    if (end <= from) return { payments: [], complete: true };
    // The invoices give a Billing payment's kind and tax; the refunds of the window's payments
    // were all made after the window began.
    const invoices = await fetchPaidInvoices(token, livemode, from - INVOICE_LEAD);
    const refunds = await fetchRefunds(token, livemode, from);
    const read = await fetchPaymentIntents(token, livemode, { since: from, before: end, maxPages });
    const payments = airwallexPayments(
      read.intents,
      refunds,
      new Map(invoices.map((invoice) => [invoice.id, invoice])),
    ).filter((payment) => payment.at >= since && (before === null || payment.at < before));
    return read.complete
      ? { payments, complete: true }
      : { payments, complete: false, from: read.from };
  },
};
