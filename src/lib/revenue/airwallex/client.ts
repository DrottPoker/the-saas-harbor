import "server-only";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import type {
  AirwallexInvoice,
  AirwallexLineItem,
  AirwallexSubscription,
  AirwallexSubscriptionItem,
} from "./mrr";
import type { AirwallexPaymentIntent, AirwallexRefund } from "./payments";

// Airwallex has one address for production and one for its sandbox (the demo environment, also
// served as api.sandbox.airwallex.com), and credentials work in their own only.
const ORIGINS = { live: "https://api.airwallex.com", sandbox: "https://api-demo.airwallex.com" };

function base(livemode: boolean) {
  const override = process.env.AIRWALLEX_API_BASE;
  if (override) return `${apiBase(override, "", "Airwallex")}/${livemode ? "live" : "sandbox"}`;
  return livemode ? ORIGINS.live : ORIGINS.sandbox;
}

export type AirwallexCredentials = { clientId: string; apiKey: string };

/**
 * A token for the key, valid for 30 minutes. This is the one POST sent to Airwallex (the owner's
 * approval of 2026-10-27): it issues a token from the Client ID and key and changes nothing in the
 * account. A 401 means the credentials are not a key of this environment. Airwallex allows 100
 * of these a minute per key, and every read asks for one.
 */
export async function fetchToken({ clientId, apiKey }: AirwallexCredentials, livemode: boolean) {
  let response: Response;
  try {
    response = await fetch(`${base(livemode)}/api/v1/authentication/login`, {
      method: "POST",
      headers: { "x-client-id": clientId, "x-api-key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderRequestError("Airwallex could not be reached. Try again shortly.");
  }
  const body = await errorBody(response);
  if (response.status === 401)
    throw new ProviderRequestError(
      "Airwallex refused the Client ID and API key. Check that both come from the API keys of your live account, and that the key has not been regenerated.",
      401,
    );
  if (response.status === 403)
    throw new ProviderRequestError(
      "Airwallex refused access for the key. If the key only works from some IP addresses, remove that limit.",
      403,
    );
  if (response.status === 429)
    throw new ProviderRequestError("Airwallex is rate limiting requests. Try again later.", 429);
  if (!response.ok || typeof body?.token !== "string")
    throw new ProviderRequestError(
      "Airwallex did not issue access for the key. Try again shortly.",
    );
  return body.token;
}

async function send(token: string, livemode: boolean, path: string, params: URLSearchParams) {
  const url = new URL(`${base(livemode)}${path}`);
  url.search = params.toString();
  return providerGet("airwallex", "Airwallex", url, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  });
}

/** What a key refused at `path` is missing, in the words of the key's settings. */
function missingAccess(path: string) {
  if (path.startsWith("/api/v1/billing/subscriptions"))
    return "The key cannot read subscriptions. Give it Read access to Subscriptions under Billing.";
  if (path.startsWith("/api/v1/billing/invoices"))
    return "The key cannot read invoices. Give it Read access to Invoices under Billing.";
  if (path.startsWith("/api/v1/pa/"))
    return "The key cannot read payments. Give it Read access to Payment Acceptance, for the one account that takes your payments.";
  return "The key is missing a read permission.";
}

async function failure(response: Response, path: string): Promise<never> {
  const body = await errorBody(response);
  const detail = typeof body?.message === "string" ? body.message.slice(0, 300) : null;
  if (response.status === 401)
    throw new ProviderRequestError("Airwallex refused the key's access. Try again shortly.", 401);
  if (response.status === 403) throw new ProviderRequestError(missingAccess(path), 403, path);
  if (response.status === 429)
    throw new ProviderRequestError("Airwallex is rate limiting requests. Try again later.", 429);
  throw new ProviderRequestError(
    `Airwallex returned an error${detail ? `: ${detail}` : "."}`,
    response.status,
    path,
  );
}

async function airwallexGet<T>(
  token: string,
  livemode: boolean,
  path: string,
  params: URLSearchParams,
) {
  const response = await send(token, livemode, path, params);
  if (response.ok) return (await response.json()) as T;
  return failure(response, path);
}

/**
 * Whether the key can read `path`: true when Airwallex answers it, and false when it refuses the
 * key, which is what a key limited to the reads verification needs should get there.
 */
export async function canRead(
  token: string,
  livemode: boolean,
  { path, query }: { path: string; query: string },
) {
  const response = await send(token, livemode, path, new URLSearchParams(query));
  if (response.ok) return true;
  if ([401, 403, 404].includes(response.status)) return false;
  return failure(response, path);
}

/**
 * Reads verification needs none of, which an admin key, or a scoped key with more than the reads
 * asked for, can make: the account's balances, and Billing's products.
 */
export const OTHER_ACCESS = [
  { path: "/api/v1/balances/current", query: "" },
  { path: "/api/v1/billing/products", query: "page_size=1" },
];

/** ISO 8601 with an explicit time zone, as Payment Acceptance's filters require. */
const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

// Billing lists follow the cursor of the previous page. Airwallex documents only the default
// page size of 20.
const BILLING_PAGE_SIZE = "100";
type BillingPage<T> = { items?: T[] | null; page_after?: string | null };

async function listBilling<T>(
  token: string,
  livemode: boolean,
  path: string,
  params: [string, string][],
) {
  const items: T[] = [];
  let page: string | null = null;
  for (let request = 0; request < MAX_PAGES; request++) {
    const query = new URLSearchParams([...params, ["page_size", BILLING_PAGE_SIZE]]);
    if (page) query.set("page", page);
    const result: BillingPage<T> = await airwallexGet<BillingPage<T>>(token, livemode, path, query);
    items.push(...(result.items ?? []));
    page = result.page_after || null;
    if (!page || !result.items?.length) return items;
  }
  throw tooMuchData("Airwallex", path);
}

// Payment Acceptance lists number their pages from 0 and allow up to 1,000 items a page.
const PA_PAGE_SIZE = "500";
type PaPage<T> = { items?: T[] | null; has_more?: boolean | null };

/** Subscriptions in one status. Read access: Subscriptions. */
export function fetchSubscriptions(token: string, livemode: boolean, status: string) {
  return listBilling<AirwallexSubscription>(token, livemode, "/api/v1/billing/subscriptions", [
    ["status", status],
  ]);
}

/** A subscription's items with their prices. Read access: Subscriptions. */
export function fetchSubscriptionItems(token: string, livemode: boolean, id: string) {
  return listBilling<AirwallexSubscriptionItem>(
    token,
    livemode,
    `/api/v1/billing/subscriptions/${encodeURIComponent(id)}/items`,
    [],
  );
}

/** Paid invoices created from `since` (Unix seconds) on. Read access: Invoices. */
export function fetchPaidInvoices(token: string, livemode: boolean, since: number) {
  return listBilling<AirwallexInvoice>(token, livemode, "/api/v1/billing/invoices", [
    ["payment_status", "PAID"],
    ["from_created_at", iso(since)],
  ]);
}

/** An invoice's lines, with their periods. Read access: Invoices. */
export function fetchInvoiceLines(token: string, livemode: boolean, id: string) {
  return listBilling<AirwallexLineItem>(
    token,
    livemode,
    `/api/v1/billing/invoices/${encodeURIComponent(id)}/line_items`,
    [],
  );
}

const REFUNDS = "/api/v1/pa/refunds";

/** Refunds created from `since` (Unix seconds) on. Read access: Payment Acceptance. */
export async function fetchRefunds(token: string, livemode: boolean, since: number) {
  const refunds: AirwallexRefund[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await airwallexGet<PaPage<AirwallexRefund>>(
      token,
      livemode,
      REFUNDS,
      new URLSearchParams({
        from_created_at: iso(since),
        page_num: String(page),
        page_size: PA_PAGE_SIZE,
      }),
    );
    refunds.push(...(result.items ?? []));
    if (!result.has_more || !result.items?.length) return refunds;
  }
  throw tooMuchData("Airwallex", REFUNDS);
}

const DAY = 86_400;
/** The list's order is not documented, so payments are read a year at a time, each year whole. */
const SLICE = 365 * DAY;
const INTENTS = "/api/v1/pa/payment_intents";

/**
 * Succeeded payment intents created from `since` to `before`, a year at a time, each page a
 * request counted against `maxPages`. A read that runs out of requests returns the years it
 * finished and the start of the oldest one, from which the window is complete.
 */
export async function fetchPaymentIntents(
  token: string,
  livemode: boolean,
  { since, before, maxPages }: { since: number; before: number; maxPages: number },
): Promise<{ intents: AirwallexPaymentIntent[]; complete: boolean; from?: number }> {
  let requests = 0;
  const intents: AirwallexPaymentIntent[] = [];
  let end = before;
  while (end > since) {
    const start = Math.max(since, end - SLICE);
    const slice: AirwallexPaymentIntent[] = [];
    for (let page = 0; ; page++) {
      if (requests++ >= maxPages) return { intents, complete: false, from: end };
      const result = await airwallexGet<PaPage<AirwallexPaymentIntent>>(
        token,
        livemode,
        INTENTS,
        new URLSearchParams({
          status: "SUCCEEDED",
          from_created_at: iso(start),
          to_created_at: iso(end),
          page_num: String(page),
          page_size: PA_PAGE_SIZE,
        }),
      );
      slice.push(...(result.items ?? []));
      if (!result.has_more || !result.items?.length) break;
    }
    intents.push(...slice);
    end = start;
  }
  return { intents, complete: true };
}
