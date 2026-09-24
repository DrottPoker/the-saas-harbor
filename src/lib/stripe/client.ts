import "server-only";
import type { StripeCoupon, StripePrice, StripeSubscription, StripeSubscriptionItem } from "./mrr";
import { COUNTED_STATUSES } from "./mrr";

// Every request pins the API version, because responses otherwise follow each account's own
// default version and field shapes differ between versions.
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
const MAX_PAGES = 200; // 20,000 subscriptions per status

export class StripeRequestError extends Error {}

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
    throw new StripeRequestError("Stripe rejected the key. It may have been revoked.");
  if (response.status === 403)
    throw new StripeRequestError(
      `The key is missing a read permission.${detail ? ` Stripe says: ${detail}` : ""}`,
    );
  if (response.status === 429)
    throw new StripeRequestError("Stripe is rate limiting requests. Try again later.");
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
  throw new StripeRequestError("The Stripe account has too many subscriptions to verify.");
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
