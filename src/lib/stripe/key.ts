// Validation of Stripe keys pasted by makers. Only restricted keys are accepted.

import { VerificationError } from "./errors";

export type RestrictedKey = { key: string; livemode: boolean; hint: string };

/** The read permissions verification needs: the dashboard's resource names and Stripe's ids. */
export const STRIPE_KEY_PERMISSIONS = [
  { resource: "Subscriptions", id: "rak_subscription_read" },
  { resource: "Invoices", id: "rak_invoice_read" },
  { resource: "Coupons", id: "rak_coupon_read" },
  // Prices still use the permission id of the older Plans.
  { resource: "Prices", id: "rak_plan_read" },
] as const;

/**
 * Stripe's form for a new restricted key, with the name and read permissions filled in. Stripe
 * does not document these parameters, so the form also says which permissions to check.
 */
export function stripeKeyCreationUrl(name: string) {
  const url = new URL("https://dashboard.stripe.com/apikeys/create");
  url.searchParams.set("name", name);
  for (const { id } of STRIPE_KEY_PERMISSIONS) url.searchParams.append("permissions[]", id);
  return url.toString();
}

export function parseRestrictedKey(
  input: string,
  { allowTest }: { allowTest: boolean },
): RestrictedKey {
  const key = input.trim();
  if (/^(sk|pk)_(live|test)_/.test(key))
    throw new VerificationError(
      "Use a restricted key (rk_...) with read-only permissions, never your secret or publishable key.",
    );
  const match = /^rk_(live|test)_[A-Za-z0-9]{10,250}$/.exec(key);
  if (!match)
    throw new VerificationError("Paste a Stripe restricted key. It starts with rk_live_.");
  const livemode = match[1] === "live";
  if (!livemode && !allowTest)
    throw new VerificationError("Use a live-mode key. Test keys are not accepted.");
  return { key, livemode, hint: `rk_${match[1]}_…${key.slice(-4)}` };
}
