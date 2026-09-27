import "server-only";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import type { CreemProduct, CreemSubscription, CreemTransaction } from "./mrr";

// Creem has one address per environment, and a key works in its own only.
const ORIGINS = { live: "https://api.creem.io", test: "https://test-api.creem.io" };

function base(livemode: boolean) {
  const override = process.env.CREEM_API_BASE;
  if (override) return `${apiBase(override, "", "Creem")}/${livemode ? "live" : "test"}`;
  return livemode ? ORIGINS.live : ORIGINS.test;
}

async function creemGet<T>(key: string, livemode: boolean, path: string, params: URLSearchParams) {
  const url = new URL(`${base(livemode)}${path}`);
  url.search = params.toString();
  const response = await providerGet("creem", "Creem", url, {
    "x-api-key": key,
    Accept: "application/json",
  });
  if (response.ok) return (await response.json()) as T;
  const body = await errorBody(response);
  if (response.status === 401)
    throw new ProviderRequestError("Creem rejected the key. It may have been revoked.", 401);
  // Creem answers both an unknown key and a missing scope with 403.
  if (response.status === 403)
    throw new ProviderRequestError(
      "Creem refused the request. Check that the key is still active and can read products, subscriptions and transactions.",
      403,
      path,
    );
  if (response.status === 429)
    throw new ProviderRequestError("Creem is rate limiting requests. Try again later.", 429);
  const message = [body?.message].flat().find((value) => typeof value === "string") as
    string | undefined;
  throw new ProviderRequestError(
    `Creem returned an error${message ? `: ${message.slice(0, 300)}` : "."}`,
  );
}

type Page<T> = { items: T[]; pagination?: { next_page?: number | null } | null };

// Lists are numbered pages from 1, and the answer says whether there is a next one.
async function listAll<T>(key: string, livemode: boolean, path: string) {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({ page_number: String(page), page_size: "100" });
    const result = await creemGet<Page<T>>(key, livemode, path, query);
    items.push(...result.items);
    if (!result.pagination?.next_page || !result.items.length) return items;
  }
  throw tooMuchData("Creem", path);
}

/** Every subscription, whatever its status: the list has no status filter. */
export function fetchSubscriptions(key: string, livemode: boolean) {
  return listAll<CreemSubscription>(key, livemode, "/v1/subscriptions/search");
}

/** One subscription, with its latest paid transaction. */
export function fetchSubscription(key: string, livemode: boolean, id: string) {
  return creemGet<CreemSubscription>(
    key,
    livemode,
    "/v1/subscriptions",
    new URLSearchParams({ subscription_id: id }),
  );
}

/** Every transaction: the list has no date filter. */
export function fetchTransactions(key: string, livemode: boolean) {
  return listAll<CreemTransaction>(key, livemode, "/v1/transactions/search");
}

export function fetchProduct(key: string, livemode: boolean, id: string) {
  return creemGet<CreemProduct>(
    key,
    livemode,
    `/v1/products/${encodeURIComponent(id)}`,
    new URLSearchParams(),
  );
}
