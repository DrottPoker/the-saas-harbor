import "server-only";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import type { PolarOrder, PolarSubscription } from "./mrr";

// Polar's API, with the version pinned so responses keep their shape.
const ORIGINS = { live: "https://api.polar.sh", test: "https://sandbox-api.polar.sh" };
export const POLAR_API_VERSION = "2026-10";

function base(livemode: boolean) {
  const override = process.env.POLAR_API_BASE;
  if (override) return `${apiBase(override, "", "Polar")}/${livemode ? "live" : "test"}`;
  return livemode ? ORIGINS.live : ORIGINS.test;
}

/** The scope a refused request needed, as Polar names it in its WWW-Authenticate header. */
function missingScope(response: Response) {
  const scopes = /scope="([^"]+)"/.exec(response.headers.get("www-authenticate") ?? "")?.[1];
  return scopes?.split(" ").find((scope) => scope.endsWith(":read")) ?? null;
}

async function polarGet<T>(key: string, livemode: boolean, path: string, params: URLSearchParams) {
  const url = new URL(`${base(livemode)}${path}`);
  url.search = params.toString();
  const response = await providerGet("polar", "Polar", url, {
    Authorization: `Bearer ${key}`,
    "Polar-Version": POLAR_API_VERSION,
    Accept: "application/json",
  });
  if (response.ok) return (await response.json()) as T;
  const body = await errorBody(response);
  if (response.status === 401)
    throw new ProviderRequestError(
      "Polar rejected the token. It may have expired or been revoked.",
      401,
    );
  if (response.status === 403) {
    const scope = missingScope(response);
    throw new ProviderRequestError(
      scope
        ? `The token is missing the ${scope} scope.`
        : "The token is missing a scope this verification needs.",
      403,
      path,
    );
  }
  if (response.status === 429)
    throw new ProviderRequestError("Polar is rate limiting requests. Try again later.", 429);
  const detail = typeof body?.detail === "string" ? body.detail.slice(0, 300) : null;
  throw new ProviderRequestError(`Polar returned an error${detail ? `: ${detail}` : "."}`);
}

type Page<T> = { items: T[]; pagination: { max_page: number } };

async function listAll<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: [string, string][],
) {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams([...params, ["limit", "100"], ["page", String(page)]]);
    const result = await polarGet<Page<T>>(key, livemode, path, query);
    items.push(...result.items);
    if (page >= result.pagination.max_page || !result.items.length) return items;
  }
  throw tooMuchData("Polar", path);
}

/** The token's organization, which also tells whether the token works. Scope: organizations:read. */
export async function fetchOrganization(key: string, livemode: boolean) {
  const result = await polarGet<Page<{ id: string }>>(
    key,
    livemode,
    "/v1/organizations/",
    new URLSearchParams({ limit: "1" }),
  );
  return result.items[0] ?? null;
}

/** Active and past-due subscriptions. Scope: subscriptions:read. */
export function fetchSubscriptions(key: string, livemode: boolean) {
  return listAll<PolarSubscription>(key, livemode, "/v1/subscriptions/", [
    ["status", "active"],
    ["status", "past_due"],
  ]);
}

/** Paid recurring orders created after `since` (Unix seconds). Scope: orders:read. */
export function fetchOrders(key: string, livemode: boolean, since: number) {
  return listAll<PolarOrder>(key, livemode, "/v1/orders/", [
    ["product_billing_type", "recurring"],
    ["status", "paid"],
    ["status", "partially_refunded"],
    ["created_after", new Date(since * 1000).toISOString()],
  ]);
}
