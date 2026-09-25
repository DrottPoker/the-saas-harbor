import "server-only";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import type { DodoPayment, DodoSubscription } from "./mrr";

// Dodo Payments has one address per environment, and a key works in its own only.
const ORIGINS = { live: "https://live.dodopayments.com", test: "https://test.dodopayments.com" };

function base(livemode: boolean) {
  const override = process.env.DODO_API_BASE;
  if (override) return `${apiBase(override, "", "Dodo Payments")}/${livemode ? "live" : "test"}`;
  return livemode ? ORIGINS.live : ORIGINS.test;
}

async function dodoGet<T>(key: string, livemode: boolean, path: string, params: URLSearchParams) {
  const url = new URL(`${base(livemode)}${path}`);
  url.search = params.toString();
  const response = await providerGet("dodo", "Dodo Payments", url, {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  });
  if (response.ok) return (await response.json()) as T;
  const body = await errorBody(response);
  if (response.status === 401)
    throw new ProviderRequestError(
      "Dodo Payments rejected the key. It may have been revoked, or belong to the other environment.",
      401,
    );
  if (response.status === 403)
    throw new ProviderRequestError(
      "The key is not allowed to read what this verification needs.",
      403,
      path,
    );
  if (response.status === 429)
    throw new ProviderRequestError(
      "Dodo Payments is rate limiting requests. Try again later.",
      429,
    );
  // Dodo documents { code, message } and has been seen to answer { error }.
  const detail = [body?.message, body?.error].find((value) => typeof value === "string") as
    string | undefined;
  throw new ProviderRequestError(
    `Dodo Payments returned an error${detail ? `: ${detail.slice(0, 300)}` : "."}`,
  );
}

// Lists are numbered pages from 0; a short page is the last one. Every page is asked for by
// number, since a missing page_number would start from the first page again.
async function listAll<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: Record<string, string>,
) {
  const items: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ ...params, page_size: "100", page_number: String(page) });
    const result = await dodoGet<{ items: T[] }>(key, livemode, path, query);
    items.push(...result.items);
    if (result.items.length < 100) return items;
  }
  throw tooMuchData("Dodo Payments", path);
}

/** The key's brands, which also tells whether the key works in this environment. */
export function fetchBrands(key: string, livemode: boolean) {
  return dodoGet<{ items: unknown[] }>(key, livemode, "/brands", new URLSearchParams());
}

/** Active and past-due subscriptions: the list filters one status at a time. */
export async function fetchSubscriptions(key: string, livemode: boolean) {
  const active = await listAll<DodoSubscription>(key, livemode, "/subscriptions", {
    status: "active",
  });
  const pastDue = await listAll<DodoSubscription>(key, livemode, "/subscriptions", {
    status: "past_due",
  });
  return [...active, ...pastDue];
}

/** The latest successful payment of a subscription, with its tax, or null without one. */
export async function fetchLatestPayment(key: string, livemode: boolean, subscriptionId: string) {
  const list = await dodoGet<{ items: { payment_id: string }[] }>(
    key,
    livemode,
    "/payments",
    new URLSearchParams({
      subscription_id: subscriptionId,
      status: "succeeded",
      page_size: "1",
      page_number: "0",
    }),
  );
  const first = list.items[0];
  if (!first) return null;
  return dodoGet<DodoPayment>(
    key,
    livemode,
    `/payments/${encodeURIComponent(first.payment_id)}`,
    new URLSearchParams(),
  );
}
