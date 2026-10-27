import "server-only";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import type { PaystackPlan, PaystackSubscription, PaystackTransaction } from "./mrr";
import type { PaystackRefund } from "./payments";

// Paystack has one address for test and live mode: the key decides which data it reads.
const ORIGIN = "https://api.paystack.co";

function base(livemode: boolean) {
  const override = process.env.PAYSTACK_API_BASE;
  if (override) return `${apiBase(override, "", "Paystack")}/${livemode ? "live" : "test"}`;
  return ORIGIN;
}

/**
 * What each list reads, and the scope it needs. Paystack lists its scopes by resource but not
 * which endpoints each covers, and has none named for subscriptions, so plans:read is the likely
 * one.
 */
const LISTS: Record<string, [string, string]> = {
  "/subscription": ["subscriptions", "plans:read"],
  "/plan": ["plans", "plans:read"],
  "/transaction": ["transactions", "transactions:read"],
  "/refund": ["refunds", "disputes_refunds:read"],
};

async function paystackGet<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: URLSearchParams,
) {
  const url = new URL(`${base(livemode)}${path}`);
  url.search = params.toString();
  const response = await providerGet("paystack", "Paystack", url, {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  });
  if (response.ok) return (await response.json()) as T;
  const body = await errorBody(response);
  const detail = typeof body?.message === "string" ? body.message.slice(0, 300) : null;
  // Paystack answers a revoked, expired or rotated key, and one it does not know, with 401.
  // Stripe's restricted keys start with rk_ too.
  if (response.status === 401)
    throw new ProviderRequestError(
      "Paystack rejected the key. It may have been revoked, rotated or expired, or be another provider's key.",
      401,
    );
  if (response.status === 403) {
    const [what, scope] = LISTS[path] ?? ["this", "read"];
    throw new ProviderRequestError(
      `The key cannot read ${what}. Give it the ${scope} scope on the Paystack dashboard.`,
      403,
      path,
    );
  }
  if (response.status === 429)
    throw new ProviderRequestError("Paystack is rate limiting requests. Try again later.", 429);
  throw new ProviderRequestError(
    `Paystack returned an error${detail ? `: ${detail}` : "."}`,
    response.status,
  );
}

type Page<T> = {
  data?: T[] | null;
  meta?: { page?: number; pageCount?: number; perPage?: number | string } | null;
};

/** Records per page: Paystack's default is 50, and it advises against more than 1,000. */
export const PER_PAGE = 100;

/** Whether a page is a list's last: it is empty, or its count of pages or its size says so. */
export function lastPage(meta: Page<unknown>["meta"], count: number, page: number) {
  if (!count) return true;
  const pageCount = Number(meta?.pageCount);
  if (Number.isFinite(pageCount) && pageCount > 0) return page >= pageCount;
  const perPage = Number(meta?.perPage);
  return Number.isFinite(perPage) && perPage > 0 && count < perPage;
}

// Lists are numbered pages from 1. `complete` is false when a list goes on beyond `maxPages`.
async function listPages<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: [string, string][],
  maxPages: number,
) {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const query = new URLSearchParams([
      ...params,
      ["perPage", String(PER_PAGE)],
      ["page", String(page)],
    ]);
    const result = await paystackGet<Page<T>>(key, livemode, path, query);
    const data = Array.isArray(result.data) ? result.data : [];
    items.push(...data);
    if (lastPage(result.meta, data.length, page)) return { items, complete: true };
  }
  return { items, complete: false };
}

async function listAll<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: [string, string][] = [],
) {
  const { items, complete } = await listPages<T>(key, livemode, path, params, MAX_PAGES);
  if (!complete) throw tooMuchData("Paystack", path);
  return items;
}

/** Paystack began in 2015; a window that starts earlier is read without a start. */
const FIRST_DAY = Date.UTC(2015, 0, 1) / 1000;
const time = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Every subscription, whatever its status: the list has no status filter. */
export function fetchSubscriptions(key: string, livemode: boolean) {
  return listAll<PaystackSubscription>(key, livemode, "/subscription");
}

/** Every plan, with the subscriptions to it. */
export function fetchPlans(key: string, livemode: boolean) {
  return listAll<PaystackPlan>(key, livemode, "/plan");
}

/**
 * Transactions created from `since` to `before` (Unix seconds, or up to now), newest first, in
 * one status or all of them.
 */
export function fetchTransactions(
  key: string,
  livemode: boolean,
  {
    since,
    before,
    status,
    maxPages,
  }: { since: number; before: number | null; status?: string; maxPages: number },
) {
  const params: [string, string][] = [];
  if (since > FIRST_DAY) params.push(["from", time(since)]);
  if (before !== null) params.push(["to", time(before)]);
  if (status) params.push(["status", status]);
  return listPages<PaystackTransaction>(key, livemode, "/transaction", params, maxPages);
}

/** Refunds created from `since` on. */
export function fetchRefunds(key: string, livemode: boolean, since: number) {
  return listAll<PaystackRefund>(
    key,
    livemode,
    "/refund",
    since > FIRST_DAY ? [["from", time(since)]] : [],
  );
}
