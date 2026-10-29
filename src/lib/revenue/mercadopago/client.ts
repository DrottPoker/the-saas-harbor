import "server-only";
import {
  apiBase,
  errorBody,
  providerGet,
  ProviderRequestError,
  rateLimited,
  returnedError,
  tooMuchData,
} from "../http";
import type { MercadoPagoPayment, MercadoPagoPreapproval } from "./mrr";

// Mercado Pago's API, with the seller's OAuth access token as a bearer token. An override points
// at the browser tests' fake server.
export function mercadoPagoApiBase() {
  return apiBase(process.env.MERCADOPAGO_API_BASE, "https://api.mercadopago.com", "Mercado Pago");
}

async function mercadoPagoGet<T>(token: string, path: string, params = new URLSearchParams()) {
  const url = new URL(`${mercadoPagoApiBase()}${path}`);
  url.search = params.toString();
  const response = await providerGet("mercadopago", "Mercado Pago", url, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  });
  if (response.ok) return (await response.json()) as T;
  const body = await errorBody(response);
  if (response.status === 401)
    throw new ProviderRequestError(
      "common.connectionRevoked",
      { provider: "Mercado Pago" },
      { status: 401 },
    );
  if (response.status === 403)
    throw new ProviderRequestError(
      "common.connectionCannotRead",
      { provider: "Mercado Pago" },
      { status: 403, path },
    );
  if (response.status === 404)
    throw new ProviderRequestError("mercadopago.notFound", {}, { status: 404, path });
  if (response.status === 429) throw rateLimited("Mercado Pago");
  const message = typeof body?.message === "string" ? body.message.slice(0, 300) : null;
  throw returnedError("Mercado Pago", message, { status: response.status, path });
}

type SearchPage<T> = {
  paging?: { total?: number | null; offset?: number | null; limit?: number | null } | null;
  results?: T[] | null;
};

/** Items a search page holds: the payment search's documented largest page. */
const PAGE = 50;
/** The furthest offset a search reads (payments: 10,000); a longer list is read in parts. */
export const MAX_OFFSET = 10_000;
const DAY = 86_400;
/** A payment search covers less than 365 days at a time. */
const SLICE = 180 * DAY;

/** Whether a page was the last: an empty one, or one that reached the total. */
function lastPage<T>(page: SearchPage<T>, offset: number) {
  const results = page.results ?? [];
  const total = page.paging?.total;
  return !results.length || (typeof total === "number" ? offset >= total : results.length < PAGE);
}

/** The account the token belongs to, and its tags, which mark test users. */
export function fetchUser(token: string) {
  return mercadoPagoGet<{ id: number | string; tags?: string[] | null }>(token, "/users/me");
}

const PREAPPROVALS = "/preapproval/search";

/** The seller's subscriptions with a status, or all of them, each once. */
export async function fetchPreapprovals(token: string, status: string | null, maxPages: number) {
  const found = new Map<string, MercadoPagoPreapproval>();
  let offset = 0;
  for (let page = 0; page < maxPages && offset + PAGE <= MAX_OFFSET; page++) {
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (status) params.set("status", status);
    const result = await mercadoPagoGet<SearchPage<MercadoPagoPreapproval>>(
      token,
      PREAPPROVALS,
      params,
    );
    for (const preapproval of result.results ?? []) found.set(preapproval.id, preapproval);
    offset += result.results?.length ?? 0;
    if (lastPage(result, offset)) return [...found.values()];
  }
  throw tooMuchData("Mercado Pago", PREAPPROVALS);
}

/** One subscription, or null when Mercado Pago no longer has it. */
export async function fetchPreapproval(token: string, id: string) {
  try {
    return await mercadoPagoGet<MercadoPagoPreapproval>(
      token,
      `/preapproval/${encodeURIComponent(id)}`,
    );
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 404) return null;
    throw error;
  }
}

const PAYMENTS = "/v1/payments/search";

// Mercado Pago's dates, with milliseconds and an offset, as its examples write them.
const time = (ms: number) => new Date(ms).toISOString().replace(/Z$/, "-00:00");

/**
 * The approved payments to the seller from `since` to `before` (Unix seconds), newest first by
 * approval, 180 days a search. A search reads no further than its largest offset, so a longer one
 * goes on from the oldest approval it listed, and payments listed twice count once. Every page is
 * a request counted against `maxPages`; a read that runs out covers its window from `from`.
 */
export async function fetchPayments(
  token: string,
  userId: string,
  { since, before, maxPages }: { since: number; before: number; maxPages: number },
): Promise<{ payments: MercadoPagoPayment[]; complete: boolean; from?: number }> {
  const found = new Map<string, MercadoPagoPayment>();
  let requests = 0;
  let end = before;
  while (end > since) {
    const start = Math.max(since, end - SLICE);
    // The search's end is inclusive, to the millisecond.
    let upper = end * 1000 - 1;
    let oldest: number | null = null;
    for (let offset = 0; ;) {
      if (requests++ >= maxPages) {
        // Everything after the oldest approval listed has been read.
        const from = oldest === null ? end : Math.floor(oldest / 1000) + 1;
        return { payments: [...found.values()], complete: false, from };
      }
      const params = new URLSearchParams({
        sort: "date_approved",
        criteria: "desc",
        range: "date_approved",
        begin_date: time(start * 1000),
        end_date: time(upper),
        status: "approved",
        "collector.id": userId,
        limit: String(PAGE),
        offset: String(offset),
      });
      const page = await mercadoPagoGet<SearchPage<MercadoPagoPayment>>(token, PAYMENTS, params);
      for (const payment of page.results ?? []) {
        found.set(String(payment.id), payment);
        const approved = Date.parse(payment.date_approved ?? "");
        if (!Number.isNaN(approved)) oldest = Math.min(oldest ?? approved, approved);
      }
      offset += page.results?.length ?? 0;
      if (lastPage(page, offset)) break;
      if (offset + PAGE > MAX_OFFSET) {
        // More payments share one instant than a search lists.
        if (oldest === null || oldest >= upper) throw tooMuchData("Mercado Pago", PAYMENTS);
        upper = oldest;
        offset = 0;
      }
    }
    end = start;
  }
  return { payments: [...found.values()], complete: true };
}
