import "server-only";
import { VerificationError } from "../errors";
import { historyWindowStart } from "../history";
import { MAX_PAGES, ProviderRequestError } from "../http";
import { addDays, dayOf, dayStart } from "../payments";
import type { ProviderAdapter } from "../types";
import {
  eachSalesPage,
  fetchDailySales,
  fetchProducts,
  fetchSubscribers,
  fetchTokenScopes,
  fetchUser,
} from "./client";
import {
  countedSubscribers,
  gumroadMrr,
  gumroadServiceLines,
  isMembership,
  isPeriodCharge,
  latestCharges,
  salesWindowStart,
  type GumroadSale,
  type GumroadSubscriber,
} from "./mrr";
import { readOnlyScopes } from "./oauth";
import { summaryPayments } from "./payments";

/** Gumroad started in 2011, so its sales are read from then on. */
const FIRST_SALE_DAY = "2011-01-01";

/** Refuses a token that can do more than read sales, every time it is used. */
async function requireReadOnly(token: string) {
  if (!readOnlyScopes(await fetchTokenScopes(token)))
    throw new VerificationError(
      "The Gumroad connection can do more than read sales, or cannot read them. Connect Gumroad again.",
    );
}

/** The active, counted subscribers of the account's memberships, product by product. */
async function subscribersByProduct(token: string, now: Date) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const products = (await fetchProducts(token, MAX_PAGES)).filter(isMembership);
  const byProduct = new Map<string, GumroadSubscriber[]>();
  for (const product of products) {
    const subscribers = await fetchSubscribers(token, product.id, MAX_PAGES);
    byProduct.set(
      product.id,
      countedSubscribers(subscribers, nowSeconds).map((s) => ({ ...s, product_id: product.id })),
    );
  }
  return byProduct;
}

/**
 * Each subscriber's latest charge, read newest first until every subscriber has one or the window
 * of a billing period and a month has been read.
 */
async function latestSales(
  token: string,
  byProduct: ReadonlyMap<string, GumroadSubscriber[]>,
  now: Date,
) {
  const sales: GumroadSale[] = [];
  for (const [productId, subscribers] of byProduct) {
    if (!subscribers.length) continue;
    const needed = new Set(subscribers.map((subscriber) => subscriber.id));
    const after = dayOf(salesWindowStart(subscribers, now));
    await eachSalesPage(token, productId, after, MAX_PAGES, (page) => {
      for (const sale of page)
        if (isPeriodCharge(sale) && needed.delete(sale.subscription_id!)) sales.push(sale);
      return needed.size > 0;
    });
  }
  return sales;
}

/** Every sale of the memberships since the history's first month, for MRR and the history. */
async function membershipSales(token: string, productIds: string[], now: Date) {
  const after = dayOf(historyWindowStart(now));
  const sales: GumroadSale[] = [];
  for (const productId of productIds)
    await eachSalesPage(token, productId, after, MAX_PAGES, (page) => void sales.push(...page));
  return sales;
}

/**
 * Gumroad, connected through OAuth with a token that can only view sales: MRR from the active
 * subscribers of memberships, each valued by its latest charge, history from those charges, and
 * revenue from the daily sales summary.
 */
export const gumroad: ProviderAdapter = {
  id: "gumroad",
  parseKey: () => {
    throw new VerificationError(
      "Connect Gumroad with the Connect with Gumroad button. Gumroad's access tokens can change your account, so they are not accepted here.",
    );
  },
  async read(token, _livemode, { now, history }) {
    await requireReadOnly(token);
    const byProduct = await subscribersByProduct(token, now);
    const subscribers = [...byProduct.values()].flat();
    let sales: GumroadSale[] | null = null;
    let historyNote: string | null = null;
    if (history)
      try {
        sales = await membershipSales(token, [...byProduct.keys()], now);
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        historyNote =
          "The Gumroad account has more sales than one verification reads, so there is no revenue history.";
      }
    const latest = latestCharges(sales ?? (await latestSales(token, byProduct, now)));
    return {
      livemode: true,
      ...gumroadMrr(subscribers, latest),
      lines: sales ? gumroadServiceLines(sales) : null,
      historyNote,
    };
  },
  // The summary covers any window in one request, so every read is complete.
  async payments(token, _livemode, { since, before }) {
    await requireReadOnly(token);
    const account = (await fetchUser(token)).id;
    const from = dayOf(Math.max(since, dayStart(FIRST_SALE_DAY)));
    // Gumroad's days follow the seller's time zone, which may be a day ahead of UTC.
    const to = before === null ? addDays(dayOf(Date.now() / 1000), 1) : addDays(dayOf(before), -1);
    if (to < from) return { payments: [], complete: true };
    const days = await fetchDailySales(token, from, to);
    return { payments: summaryPayments(account, days, since, before), complete: true };
  },
};
