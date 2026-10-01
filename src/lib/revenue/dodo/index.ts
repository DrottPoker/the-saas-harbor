import "server-only";
import { ProviderRequestError } from "../http";
import { dayOf, dayStart } from "../payments";
import type { ListedPayment, PaymentOptions, ProviderAdapter } from "../types";
import {
  fetchBrands,
  fetchLatestPayment,
  fetchPayment,
  fetchPaymentPage,
  fetchSubscriptions,
} from "./client";
import { parseDodoKey } from "./key";
import { dodoMrr, taxIncludedSubscriptions, untaxedShare, type DodoListedPayment } from "./mrr";
import { dodoEarned, dodoFingerprint, dodoKind } from "./payments";

// Each tax-inclusive subscription costs two requests, and Dodo allows 240 a minute per business.
const MAX_TAX_LOOKUPS = 200;
const DAY = 86_400;
/** Payments are listed a month at a time, each month whole, since the list's order is unknown. */
const SLICE = 30 * DAY;

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
 * Payments from `before` back to `since`, a month at a time, each request counted against
 * `maxPages`. A payment is valued with a request of its own unless it is stored unchanged. A read
 * that runs out of requests covers the days after the newest one it could not value, and returns
 * the payments it valued on that day too, so they are stored and the next read goes further.
 */
async function readPayments(
  key: string,
  livemode: boolean,
  { since, before, maxPages, stored }: PaymentOptions,
) {
  let requests = 0;
  const payments: ListedPayment[] = [];
  let end = before ?? Math.floor(Date.now() / 1000);
  while (end > since) {
    const start = Math.max(since, end - SLICE);
    const listed: DodoListedPayment[] = [];
    for (let page = 0; ; page++) {
      if (requests++ >= maxPages) return { payments, complete: false, from: end };
      const { items } = await fetchPaymentPage(key, livemode, start, end, page);
      listed.push(...items);
      if (items.length < 100) break;
    }
    const newestFirst = listed
      .map((payment) => ({ payment, at: Math.floor(Date.parse(payment.created_at) / 1000) }))
      .filter(({ at }) => Number.isFinite(at))
      .sort((a, b) => b.at - a.at);
    for (const { payment, at } of newestFirst) {
      const fingerprint = dodoFingerprint(payment);
      if (stored(payment.payment_id)?.fingerprint === fingerprint) {
        payments.push({
          id: payment.payment_id,
          at,
          fingerprint,
          value: null,
          kind: dodoKind(payment),
        });
        continue;
      }
      if (requests++ >= maxPages) {
        // The days after this payment's are complete; its own day is left for the next read,
        // which finds the payments valued here stored.
        return { payments, complete: false, from: dayStart(dayOf(at)) + DAY };
      }
      const detail = await fetchPayment(key, livemode, payment.payment_id);
      payments.push({
        id: payment.payment_id,
        at,
        fingerprint,
        value: { currency: payment.currency, amount: dodoEarned(detail) },
        kind: dodoKind(payment),
      });
    }
    end = start;
    // After a month without payments, one request tells whether any came before it at all.
    if (!listed.length && end > since) {
      if (requests++ >= maxPages) return { payments, complete: false, from: end };
      if (!(await fetchPaymentPage(key, livemode, since, end, 0)).items.length) break;
    }
  }
  return { payments, complete: true };
}

/**
 * Dodo Payments: MRR from subscriptions, and revenue from successful payments. Payments do not
 * say which period they cover, so there is no history.
 */
export const dodo: ProviderAdapter = {
  id: "dodo",
  parseKey: ({ key }) => parseDodoKey(key),
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
  payments: readPayments,
};
