import "server-only";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchProduct, fetchSubscription, fetchSubscriptions, fetchTransactions } from "./client";
import { parseCreemKey } from "./key";
import {
  COUNTED_STATUSES,
  creemMrr,
  creemServiceLines,
  productOf,
  type CreemProduct,
  type CreemSubscription,
  type CreemTransaction,
} from "./mrr";
import { transactionPayments } from "./payments";

// A store sells a handful of products; these caps keep one run's lookups bounded.
const MAX_PRODUCT_LOOKUPS = 100;
const MAX_TAX_LOOKUPS = 200;

/** The products that subscriptions name by id only. */
async function fetchProducts(key: string, livemode: boolean, subscriptions: CreemSubscription[]) {
  const ids = new Set(
    subscriptions.flatMap((subscription) =>
      typeof subscription.product === "string" ? [subscription.product] : [],
    ),
  );
  if (ids.size > MAX_PRODUCT_LOOKUPS)
    throw new ProviderRequestError(
      "The Creem account has more products than one verification reads.",
      undefined,
      "/v1/products",
      true,
    );
  const products = new Map<string, CreemProduct>();
  for (const id of ids) products.set(id, await fetchProduct(key, livemode, id));
  return products;
}

/**
 * The latest transactions of counted tax-inclusive subscriptions that the list gave without one,
 * read one subscription at a time.
 */
async function missingTaxTransactions(
  key: string,
  livemode: boolean,
  subscriptions: CreemSubscription[],
  products: ReadonlyMap<string, CreemProduct>,
) {
  const missing = subscriptions.filter(
    (subscription) =>
      (COUNTED_STATUSES as readonly string[]).includes(subscription.status) &&
      productOf(subscription, products)?.tax_mode === "inclusive" &&
      !subscription.last_transaction,
  );
  if (missing.length > MAX_TAX_LOOKUPS)
    throw new ProviderRequestError(
      "The Creem account has more tax-inclusive subscriptions than one verification reads.",
      undefined,
      "/v1/subscriptions",
      true,
    );
  const transactions: CreemTransaction[] = [];
  for (const { id } of missing) {
    const latest = (await fetchSubscription(key, livemode, id)).last_transaction;
    if (latest) transactions.push({ ...latest, subscription: latest.subscription ?? id });
  }
  return transactions;
}

/**
 * Creem: MRR from subscriptions and their products, and history and revenue from paid
 * transactions.
 */
export const creem: ProviderAdapter = {
  id: "creem",
  parseKey: ({ key }, options) => parseCreemKey(key, options),
  async read(key, livemode, { history }) {
    const live = livemode ?? !key.startsWith("creem_test_");
    const subscriptions = await fetchSubscriptions(key, live);
    const products = await fetchProducts(key, live, subscriptions);
    let transactions: CreemTransaction[] | null = null;
    let historyNote: string | null = null;
    if (history)
      try {
        transactions = await fetchTransactions(key, live);
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        historyNote =
          "The Creem account has more transactions than one verification reads, so there is no revenue history.";
      }
    const forTax =
      transactions ?? (await missingTaxTransactions(key, live, subscriptions, products));
    return {
      livemode: live,
      ...creemMrr(subscriptions, products, forTax),
      lines: transactions ? creemServiceLines(transactions, subscriptions, products) : null,
      historyNote,
    };
  },
  // The transaction list has no date filter and no documented order, so it is read whole.
  async payments(key, livemode, { since, before }) {
    const transactions = await fetchTransactions(key, livemode);
    return { payments: transactionPayments(transactions, since, before), complete: true };
  },
};
