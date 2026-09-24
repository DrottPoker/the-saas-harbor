import "server-only";
import type { StripeCoupon, StripePrice, StripeSubscription, StripeSubscriptionItem } from "./mrr";
import { COUNTED_STATUSES } from "./mrr";
import { linePriceId, type StripeInvoice, type StripeInvoiceLine } from "./history";

// Every request pins the API version, because responses otherwise follow each account's own
// default version and field shapes differ between versions.
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
const MAX_PAGES = 200; // 20,000 objects per list

export class StripeRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function baseUrl() {
  return process.env.STRIPE_API_BASE || "https://api.stripe.com";
}

async function stripeGet<T>(
  key: string,
  path: string,
  params: [string, string][] = [],
): Promise<T> {
  const url = new URL(path, baseUrl());
  for (const [name, value] of params) url.searchParams.append(name, value);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_API_VERSION },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new StripeRequestError("Stripe could not be reached. Try again shortly.");
  }
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  const detail = body?.error?.message?.slice(0, 300);
  if (response.status === 401)
    throw new StripeRequestError("Stripe rejected the key. It may have been revoked.", 401);
  if (response.status === 403)
    throw new StripeRequestError(
      `The key is missing a read permission.${detail ? ` Stripe says: ${detail}` : ""}`,
      403,
    );
  if (response.status === 429)
    throw new StripeRequestError("Stripe is rate limiting requests. Try again later.", 429);
  throw new StripeRequestError(`Stripe returned an error${detail ? `: ${detail}` : "."}`);
}

type List<T> = { data: T[]; has_more: boolean };

async function listAll<T extends { id: string }>(
  key: string,
  path: string,
  params: [string, string][],
) {
  const items: T[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const pageParams: [string, string][] = [...params, ["limit", "100"]];
    if (startingAfter) pageParams.push(["starting_after", startingAfter]);
    const list = await stripeGet<List<T>>(key, path, pageParams);
    items.push(...list.data);
    if (!list.has_more || list.data.length === 0) return items;
    startingAfter = list.data.at(-1)!.id;
  }
  throw new StripeRequestError("The Stripe account has too much data to verify in one run.");
}

export type StripeAccountData = {
  subscriptions: StripeSubscription[];
  coupons: Map<string, StripeCoupon>;
};

// Reads everything MRR needs: counted subscriptions with discounts, then any coupons and tiered
// prices they reference. Permissions: Subscriptions, Coupons and Prices, read only.
export async function fetchStripeAccountData(key: string): Promise<StripeAccountData> {
  const subscriptions: StripeSubscription[] = [];
  for (const status of COUNTED_STATUSES) {
    subscriptions.push(
      ...(await listAll<StripeSubscription>(key, "/v1/subscriptions", [
        ["status", status],
        ["expand[]", "data.discounts"],
        ["expand[]", "data.items.data.discounts"],
      ])),
    );
  }

  for (const subscription of subscriptions) {
    if (!subscription.items.has_more) continue;
    subscription.items.data = await listAll<StripeSubscriptionItem>(key, "/v1/subscription_items", [
      ["subscription", subscription.id],
      ["expand[]", "data.discounts"],
    ]);
  }

  const couponIds = new Set<string>();
  const tieredPrices = new Map<string, StripePrice[]>();
  for (const subscription of subscriptions) {
    const discounts = [
      ...(subscription.discounts ?? []),
      ...subscription.items.data.flatMap((item) => item.discounts ?? []),
    ];
    for (const discount of discounts) {
      const coupon = typeof discount === "string" ? null : discount.source.coupon;
      if (typeof coupon === "string") couponIds.add(coupon);
    }
    for (const item of subscription.items.data) {
      if (item.price.billing_scheme !== "tiered") continue;
      const prices = tieredPrices.get(item.price.id) ?? [];
      prices.push(item.price);
      tieredPrices.set(item.price.id, prices);
    }
  }

  const coupons = new Map<string, StripeCoupon>();
  for (const id of couponIds)
    coupons.set(id, await stripeGet<StripeCoupon>(key, `/v1/coupons/${encodeURIComponent(id)}`));
  for (const [id, prices] of tieredPrices) {
    const full = await stripeGet<StripePrice>(key, `/v1/prices/${encodeURIComponent(id)}`, [
      ["expand[]", "tiers"],
    ]);
    for (const price of prices) price.tiers = full.tiers;
  }
  return { subscriptions, coupons };
}

// Reads paid invoices created since `since` (Unix seconds) with all their lines, and the prices
// those lines use, for the MRR history. Permissions: Invoices and Prices, read only.
export async function fetchPaidInvoices(key: string, since: number) {
  const invoices = await listAll<StripeInvoice>(key, "/v1/invoices", [
    ["status", "paid"],
    ["created[gte]", String(since)],
  ]);
  for (const invoice of invoices) {
    if (!invoice.lines.has_more) continue;
    invoice.lines.data = await listAll<StripeInvoiceLine>(
      key,
      `/v1/invoices/${encodeURIComponent(invoice.id)}/lines`,
      [],
    );
  }
  const prices = new Map<string, StripePrice>();
  const ids = new Set(invoices.flatMap((invoice) => invoice.lines.data.map(linePriceId)));
  for (const id of ids) {
    if (id)
      prices.set(id, await stripeGet<StripePrice>(key, `/v1/prices/${encodeURIComponent(id)}`));
  }
  return { invoices, prices };
}
