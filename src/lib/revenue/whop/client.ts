import "server-only";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import type { WhopMembership, WhopPayment, WhopPlan, WhopPromo } from "./mrr";

// Whop's API, with the version pinned so responses keep their shape: Whop changes it often.
const ORIGINS = {
  live: "https://api.whop.com/api/v1",
  test: "https://sandbox-api.whop.com/api/v1",
};
export const WHOP_API_VERSION = "2026-09-25";

function base(livemode: boolean) {
  const override = process.env.WHOP_API_BASE;
  if (override) return `${apiBase(override, "", "Whop")}/${livemode ? "live" : "test"}`;
  return livemode ? ORIGINS.live : ORIGINS.test;
}

async function whopGet<T>(key: string, livemode: boolean, path: string, params: URLSearchParams) {
  const url = new URL(`${base(livemode)}${path}`);
  url.search = params.toString();
  const response = await providerGet("whop", "Whop", url, {
    Authorization: `Bearer ${key}`,
    "Api-Version-Date": WHOP_API_VERSION,
    Accept: "application/json",
  });
  if (response.ok) return (await response.json()) as T;
  const body = await errorBody(response);
  const error = body?.error as { message?: unknown } | undefined;
  const found = [error?.message, body?.message].find((value) => typeof value === "string");
  const detail = (found as string | undefined)?.slice(0, 300);
  if (response.status === 401)
    throw new ProviderRequestError(
      "Whop rejected the key. It may have been deleted, or belong to the other environment.",
      401,
    );
  if (response.status === 403)
    throw new ProviderRequestError(
      `The key is missing a read permission.${detail ? ` Whop says: ${detail}` : ""}`,
      403,
      path,
    );
  if (response.status === 429)
    throw new ProviderRequestError("Whop is rate limiting requests. Try again later.", 429);
  throw new ProviderRequestError(
    `Whop returned an error${detail ? `: ${detail}` : "."}`,
    response.status,
  );
}

type Page<T> = { data: T[]; page_info: { end_cursor: string | null; has_next_page: boolean } };

// Lists follow the cursor of the previous page.
async function listAll<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: [string, string][],
) {
  const items: T[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams([...params, ["first", "100"]]);
    if (after) query.set("after", after);
    const result: Page<T> = await whopGet<Page<T>>(key, livemode, path, query);
    items.push(...result.data);
    after = result.page_info.end_cursor;
    if (!result.page_info.has_next_page || !after) return items;
  }
  throw tooMuchData("Whop", path);
}

/**
 * The key's own account: an account key lists it with its connected accounts, which were all
 * created after it. Needs no permission.
 */
export async function fetchAccount(key: string, livemode: boolean) {
  const result = await whopGet<{ data: { id: string }[] }>(
    key,
    livemode,
    "/accounts",
    new URLSearchParams({ first: "1", direction: "asc" }),
  );
  const account = result.data[0];
  if (!account) throw new ProviderRequestError("Whop found no account for this key.");
  return account.id;
}

/** Every permission action and whether the key holds it on the account. */
export async function fetchPermissions(key: string, livemode: boolean, accountId: string) {
  const result = await whopGet<{ data: { action: string; granted: boolean }[] }>(
    key,
    livemode,
    "/permissions",
    new URLSearchParams({ resource_id: accountId }),
  );
  return result.data;
}

/** Memberships in one status. Permission: member:basic:read. */
export function fetchMemberships(
  key: string,
  livemode: boolean,
  accountId: string,
  status: string,
) {
  return listAll<WhopMembership>(key, livemode, "/memberships", [
    ["account_id", accountId],
    ["status", status],
  ]);
}

/** Permission: plan:basic:read. */
export function fetchPlan(key: string, livemode: boolean, id: string) {
  return whopGet<WhopPlan>(
    key,
    livemode,
    `/plans/${encodeURIComponent(id)}`,
    new URLSearchParams(),
  );
}

/** Paid payments created after `since` (Unix seconds). Permission: payment:basic:read. */
export function fetchPayments(key: string, livemode: boolean, accountId: string, since: number) {
  return listAll<WhopPayment>(key, livemode, "/payments", [
    ["account_id", accountId],
    ["status", "paid"],
    ["created_after", new Date(since * 1000).toISOString()],
  ]);
}

/** Permission: promo_code:basic:read. */
export function fetchPromo(key: string, livemode: boolean, id: string) {
  return whopGet<WhopPromo>(
    key,
    livemode,
    `/promo_codes/${encodeURIComponent(id)}`,
    new URLSearchParams(),
  );
}
