import "server-only";
import {
  apiBase,
  errorBody,
  providerGet,
  ProviderRequestError,
  rateLimited,
  returnedError,
} from "../http";
import type { AbacateMrr, AbacateMrrByDay } from "./mrr";
import type { AbacateRevenue } from "./payments";

// AbacatePay's API v2. One address serves both its environments; the key decides which.
const ORIGIN = "https://api.abacatepay.com";

function base() {
  return apiBase(process.env.ABACATEPAY_API_BASE, ORIGIN, "AbacatePay");
}

/** Every answer comes in this envelope, with `success` false and a message on failure. */
type Envelope<T> = { data?: T | null; success?: boolean; error?: string | null };

function message(body: Record<string, unknown> | null) {
  return typeof body?.error === "string" ? body.error.slice(0, 300) : null;
}

async function abacateGet<T>(token: string, path: string, params = new URLSearchParams()) {
  const url = new URL(`${base()}${path}`);
  url.search = params.toString();
  const response = await providerGet("abacatepay", "AbacatePay", url, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  });
  if (response.ok) {
    const body = (await response.json()) as Envelope<T>;
    if (body.success !== false && body.data) return body.data;
    const detail = typeof body.error === "string" ? body.error.slice(0, 300) : null;
    throw returnedError("AbacatePay", detail);
  }
  const detail = message(await errorBody(response));
  if (response.status === 401)
    throw new ProviderRequestError("abacatepay.tokenRejected", {}, { status: 401 });
  if (response.status === 403)
    throw new ProviderRequestError("abacatepay.tokenRefused", {}, { status: 403, path });
  if (response.status === 429) throw rateLimited("AbacatePay");
  throw returnedError("AbacatePay", detail, { status: response.status, path });
}

export type AbacateMerchant = { id: string; name?: string; createdAt?: string | null };

/** The store the token belongs to: its id, and when it was created. */
export async function fetchMerchant(token: string) {
  const merchant = await abacateGet<AbacateMerchant>(token, "/v2/public-mrr/merchant-info");
  if (typeof merchant.id !== "string" || !merchant.id)
    throw new ProviderRequestError("abacatepay.noStore");
  return merchant;
}

/** The current MRR and active subscriptions. */
export function fetchMrr(token: string) {
  return abacateGet<AbacateMrr>(token, "/v2/public-mrr/mrr");
}

/** The MRR at the end of each day from `start` to `end` (YYYY-MM-DD, both included). */
export function fetchMrrByDay(token: string, start: string, end: string) {
  return abacateGet<AbacateMrrByDay>(
    token,
    "/v2/public-mrr/mrr-by-day",
    new URLSearchParams({ startDate: start, endDate: end }),
  );
}

/** Revenue by day from `start` to `end` (YYYY-MM-DD; `end` must come after `start`). */
export function fetchRevenue(token: string, start: string, end: string) {
  return abacateGet<AbacateRevenue>(
    token,
    "/v2/public-mrr/revenue",
    new URLSearchParams({ startDate: start, endDate: end }),
  );
}
