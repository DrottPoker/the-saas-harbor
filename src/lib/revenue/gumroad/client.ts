import "server-only";
import { apiBase, errorBody, providerGet, ProviderRequestError, tooMuchData } from "../http";
import type { GumroadProduct, GumroadSale, GumroadSubscriber } from "./mrr";
import type { GumroadSummaryDay } from "./payments";

// Gumroad's API, with the OAuth token as a bearer token. An override points at the browser tests'
// fake server.
export function gumroadApiBase() {
  return apiBase(process.env.GUMROAD_API_BASE, "https://api.gumroad.com", "Gumroad");
}

async function gumroadGet<T>(token: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${gumroadApiBase()}${path}`);
  url.search = new URLSearchParams(params).toString();
  const response = await providerGet("gumroad", "Gumroad", url, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  });
  const body = response.ok
    ? ((await response.json()) as Record<string, unknown>)
    : await errorBody(response);
  const message = typeof body?.message === "string" ? body.message.slice(0, 300) : null;
  if (response.status === 401)
    throw new ProviderRequestError(
      "Gumroad no longer accepts the connection. It may have been revoked; connect Gumroad again.",
      401,
    );
  if (response.status === 403)
    throw new ProviderRequestError(
      "The Gumroad connection cannot read what this verification needs. Connect Gumroad again.",
      403,
      path,
    );
  if (response.status === 429)
    throw new ProviderRequestError("Gumroad is rate limiting requests. Try again later.", 429);
  // Gumroad answers some failures with 200 and success: false.
  if (!response.ok || body?.success === false)
    throw new ProviderRequestError(`Gumroad returned an error${message ? `: ${message}` : "."}`);
  return body as T;
}

type Page = { next_page_key?: string | null };

/**
 * A list read page by page, newest first. `onPage` returns false once it has what it needs;
 * reading on beyond `maxPages` is too much for one run.
 */
async function eachPage<T extends Page>(
  token: string,
  path: string,
  params: Record<string, string>,
  maxPages: number,
  onPage: (page: T) => boolean | void,
) {
  let pageKey: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const query: Record<string, string> = pageKey ? { ...params, page_key: pageKey } : params;
    const result: T = await gumroadGet<T>(token, path, query);
    if (onPage(result) === false) return;
    pageKey = result.next_page_key ?? null;
    if (!pageKey) return;
  }
  throw tooMuchData("Gumroad", path);
}

/** The scopes the token holds, from the OAuth server's token information. */
export async function fetchTokenScopes(token: string) {
  const info = await gumroadGet<{ scope?: string[] | string | null; scopes?: string[] | null }>(
    token,
    "/oauth/token/info",
  );
  const scope = info.scope ?? info.scopes ?? [];
  return Array.isArray(scope) ? scope : scope.split(/\s+/).filter(Boolean);
}

/** The account the token belongs to. Scope: view_sales. */
export async function fetchUser(token: string) {
  const { user } = await gumroadGet<{ user: { id: string } }>(token, "/v2/user");
  return user;
}

/** Every product of the account. Scope: view_sales. */
export async function fetchProducts(token: string, maxPages: number) {
  const products: GumroadProduct[] = [];
  await eachPage<Page & { products: GumroadProduct[] }>(
    token,
    "/v2/products",
    {},
    maxPages,
    (page) => void products.push(...page.products),
  );
  return products;
}

/** A product's active subscribers, 100 a page. Scope: view_sales. */
export async function fetchSubscribers(token: string, productId: string, maxPages: number) {
  const subscribers: GumroadSubscriber[] = [];
  await eachPage<Page & { subscribers: GumroadSubscriber[] }>(
    token,
    `/v2/products/${encodeURIComponent(productId)}/subscribers`,
    { paginated: "true" },
    maxPages,
    (page) => void subscribers.push(...page.subscribers),
  );
  return subscribers;
}

/**
 * A product's sales from a day (YYYY-MM-DD) on, ten a page, newest first. `onSales` returns false
 * once it has what it needs. Scope: view_sales.
 */
export function eachSalesPage(
  token: string,
  productId: string,
  after: string,
  maxPages: number,
  onSales: (sales: GumroadSale[]) => boolean | void,
) {
  return eachPage<Page & { sales: GumroadSale[] }>(
    token,
    "/v2/sales",
    { product_id: productId, after },
    maxPages,
    (page) => onSales(page.sales),
  );
}

/** Sales per day between two days (YYYY-MM-DD, both included). Scope: view_sales. */
export async function fetchDailySales(token: string, from: string, to: string) {
  const summary = await gumroadGet<{ breakdown?: GumroadSummaryDay[] | null }>(
    token,
    "/v2/sales/summary",
    { from, to, group_by: "day" },
  );
  return summary.breakdown ?? [];
}
