// The read permissions a Stripe restricted key needs. Safe for the browser: the product form shows
// them and links to Stripe's form for a new key.

/**
 * The read permissions verification needs: the dashboard's resource names and Stripe's ids. MRR
 * needs the first four; revenue from all payments needs the last three as well.
 */
export const STRIPE_KEY_PERMISSIONS = [
  { resource: "Subscriptions", id: "rak_subscription_read" },
  { resource: "Invoices", id: "rak_invoice_read" },
  { resource: "Coupons", id: "rak_coupon_read" },
  // Prices still use the permission id of the older Plans.
  { resource: "Prices", id: "rak_plan_read" },
  { resource: "Charges", id: "rak_charge_read" },
  { resource: "Checkout Sessions", id: "rak_checkout_session_read" },
  { resource: "Disputes", id: "rak_dispute_read" },
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
