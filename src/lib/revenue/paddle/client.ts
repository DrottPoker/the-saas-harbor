import "server-only";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import type { PaddleSubscription, PaddleTransaction } from "./mrr";

// Paddle Billing, with the API version pinned so responses keep their shape.
const ORIGINS = { live: "https://api.paddle.com", test: "https://sandbox-api.paddle.com" };

function base(livemode: boolean) {
  const override = process.env.PADDLE_API_BASE;
  if (override) return `${apiBase(override, "", "Paddle")}/${livemode ? "live" : "test"}`;
  return livemode ? ORIGINS.live : ORIGINS.test;
}

const REJECTED = new Set(["invalid_token", "authentication_missing", "authentication_malformed"]);

type Page<T> = { data: T[]; meta: { pagination?: { next?: string; has_more?: boolean } } };

async function paddleGet<T>(key: string, livemode: boolean, path: string, params: URLSearchParams) {
  const url = new URL(`${base(livemode)}${path}`);
  url.search = params.toString();
  const response = await providerGet("paddle", "Paddle", url, {
    Authorization: `Bearer ${key}`,
    "Paddle-Version": "1",
    Accept: "application/json",
  });
  if (response.ok) return (await response.json()) as T;
  const error = (await errorBody(response))?.error as
    { code?: string; detail?: string } | undefined;
  const detail = error?.detail?.slice(0, 300);
  if (response.status === 429)
    throw new ProviderRequestError("Paddle is rate limiting requests. Try again later.", 429);
  // Paddle answers a key it does not accept with 403 too, and says so in the error code.
  if (response.status === 401 || REJECTED.has(error?.code ?? ""))
    throw new ProviderRequestError(
      "Paddle rejected the key. It may have expired or been revoked, or belong to the other environment.",
      response.status,
    );
  if (error?.code === "paddle_billing_not_enabled")
    throw new ProviderRequestError("This Paddle account does not use Paddle Billing.", 403);
  if (response.status === 403)
    throw new ProviderRequestError(
      `The key is missing a read permission.${detail ? ` Paddle says: ${detail}` : ""}`,
      403,
      path,
    );
  throw new ProviderRequestError(`Paddle returned an error${detail ? `: ${detail}` : "."}`);
}

// Lists follow Paddle's cursor. The next page is built here from its `after` value rather than
// followed as a link, so requests only ever go to Paddle's own address.
async function listAll<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: Record<string, string>,
) {
  const items: T[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams(params);
    if (after) query.set("after", after);
    const result: Page<T> = await paddleGet<Page<T>>(key, livemode, path, query);
    items.push(...result.data);
    const next = result.meta.pagination?.next;
    after = next ? new URL(next).searchParams.get("after") : null;
    if (!result.meta.pagination?.has_more || !after || !result.data.length) return items;
  }
  throw tooMuchData("Paddle", path);
}

/** Active and past-due subscriptions. Permission: Subscriptions, read. */
export function fetchSubscriptions(key: string, livemode: boolean) {
  return listAll<PaddleSubscription>(key, livemode, "/subscriptions", {
    status: "active,past_due",
    per_page: "200",
  });
}

/** Paid transactions billed since `since` (Unix seconds). Permission: Transactions, read. */
export function fetchTransactions(key: string, livemode: boolean, since: number) {
  return listAll<PaddleTransaction>(key, livemode, "/transactions", {
    status: "paid,completed",
    "billed_at[GTE]": new Date(since * 1000).toISOString(),
    order_by: "billed_at[ASC]",
    per_page: "30",
  });
}
