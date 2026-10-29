import "server-only";
import { VerificationError } from "../errors";
import { unixSeconds } from "../history";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  rateLimited,
  returnedError,
  tooMuchData,
} from "../http";
import type { MolliePayment, MollieSubscription } from "./mrr";

// Mollie has one address. An advanced access token reads live data, or test data with
// testmode=true, unless it was limited to one of them when it was made.
const ORIGIN = "https://api.mollie.com";

function base() {
  return apiBase(process.env.MOLLIE_API_BASE, ORIGIN, "Mollie");
}

/** A token, the website profile it reads, and whether it reads live data or test data. */
export type MollieAccess = { token: string; profile: string; live: boolean };

export type MolliePermission = { id: string; granted: boolean };

/** The permissions verification needs: payments for revenue and subscriptions for MRR. */
export const REQUIRED_PERMISSIONS = ["payments.read", "subscriptions.read"] as const;

/** Refuses a token that can do more than read, or that cannot read what verification needs. */
export function requireReadOnly(permissions: MolliePermission[]) {
  const granted = new Set(
    permissions.filter((permission) => permission.granted).map((permission) => permission.id),
  );
  const writes = [...granted].filter((id) => !id.endsWith(".read"));
  if (writes.length)
    throw new VerificationError("mollie.canWrite", { permissions: writes.slice(0, 3).join(", ") });
  const missing = REQUIRED_PERMISSIONS.filter((id) => !granted.has(id));
  if (missing.length)
    throw new VerificationError("mollie.cannotRead", {
      // payments, subscriptions, or both
      missing: missing.length > 1 ? "both" : missing[0]!.split(".")[0]!,
    });
}

async function mollieGet<T>(token: string, path: string, params: URLSearchParams) {
  const url = new URL(`${base()}${path}`);
  url.search = params.toString();
  const response = await providerGet("mollie", "Mollie", url, {
    Authorization: `Bearer ${token}`,
    Accept: "application/hal+json",
  });
  if (response.ok) return (await response.json()) as T;
  const body = await errorBody(response);
  const detail = typeof body?.detail === "string" ? body.detail.slice(0, 300) : null;
  if (response.status === 401)
    throw new ProviderRequestError("mollie.tokenRejected", {}, { status: 401 });
  if (response.status === 403)
    throw detail
      ? new ProviderRequestError("mollie.requestRefusedDetail", { detail }, { status: 403, path })
      : new ProviderRequestError("mollie.requestRefused", {}, { status: 403, path });
  // Lists answer a profile the token cannot reach as one that does not exist.
  if (response.status === 404 || (response.status === 422 && body?.field === "profileId"))
    throw new ProviderRequestError("mollie.noProfile", {}, { status: response.status, path });
  if (response.status === 429) throw rateLimited("Mollie");
  throw returnedError("Mollie", detail, { status: response.status });
}

type Page<T> = {
  count?: number;
  _embedded?: Record<string, T[] | undefined>;
  _links?: { next?: { href?: string | null } | null };
};

/**
 * The cursor of the next page, from Mollie's link to it. The request is built here rather than
 * sent to the link, so it only ever goes to Mollie's own address.
 */
export function nextCursor(page: Page<unknown>) {
  const href = page._links?.next?.href;
  if (!href) return null;
  try {
    return new URL(href).searchParams.get("from");
  } catch {
    return null;
  }
}

/** Mollie's largest page. */
const PAGE_SIZE = 250;

/** A list's query for the profile, in test mode where the access is not live. */
function listParams({ profile, live }: MollieAccess, from: string | null) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), profileId: profile });
  if (!live) params.set("testmode", "true");
  if (from) params.set("from", from);
  return params;
}

/** Every permission and whether the token holds it. Needs no permission. */
export async function fetchPermissions(token: string) {
  const result = await mollieGet<Page<MolliePermission>>(
    token,
    "/v2/permissions",
    new URLSearchParams(),
  );
  return result._embedded?.permissions ?? [];
}

const SUBSCRIPTIONS = "/v2/subscriptions";

/**
 * The profile's subscriptions of every customer, whatever their status: the list has no status
 * filter. Permission: subscriptions.read.
 */
export async function fetchSubscriptions(access: MollieAccess) {
  const subscriptions: MollieSubscription[] = [];
  let from: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result: Page<MollieSubscription> = await mollieGet<Page<MollieSubscription>>(
      access.token,
      SUBSCRIPTIONS,
      listParams(access, from),
    );
    const items = result._embedded?.subscriptions ?? [];
    subscriptions.push(...items);
    from = nextCursor(result);
    if (!from || !items.length) return subscriptions;
  }
  throw tooMuchData("Mollie", SUBSCRIPTIONS);
}

export const PAYMENTS = "/v2/payments";

/**
 * The profile's payments created since `since` (Unix seconds), newest first, in every status, read
 * for at most `maxPages` pages. The list has no date filter, so it is read from the newest payment
 * until a page reaches back before `since`. `oldest` is when the oldest payment read was created.
 * Permission: payments.read.
 */
export async function fetchPayments(access: MollieAccess, since: number, maxPages: number) {
  const payments: MolliePayment[] = [];
  let oldest: number | null = null;
  let from: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const params = listParams(access, from);
    params.set("sort", "desc");
    const result: Page<MolliePayment> = await mollieGet<Page<MolliePayment>>(
      access.token,
      PAYMENTS,
      params,
    );
    const items = result._embedded?.payments ?? [];
    for (const payment of items) {
      const at = unixSeconds(payment.createdAt);
      if (at === null) continue;
      oldest = oldest === null ? at : Math.min(oldest, at);
      if (at >= since) payments.push(payment);
    }
    from = nextCursor(result);
    if (!from || !items.length || (oldest !== null && oldest < since))
      return { payments, complete: true, oldest };
  }
  return { payments, complete: false, oldest };
}
