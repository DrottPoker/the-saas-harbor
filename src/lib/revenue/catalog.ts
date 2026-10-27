// The payment providers that can verify revenue, with what makers see of them. Safe for the
// browser: it holds names and labels only. `account` is a second field some providers need
// besides the key, such as the site or project the key belongs to, and `extra` any further
// fields after it. A provider with `oauth` is connected by approving access with the provider
// rather than by pasting a key.
export const PROVIDERS = {
  stripe: {
    name: "Stripe",
    keyLabel: "Restricted key",
    newKeyLabel: "New restricted key",
    placeholder: "rk_live_...",
  },
  paddle: {
    name: "Paddle",
    keyLabel: "API key",
    newKeyLabel: "New API key",
    placeholder: "pdl_live_apikey_...",
  },
  polar: {
    name: "Polar",
    keyLabel: "Organization access token",
    newKeyLabel: "New organization access token",
    placeholder: "polar_oat_...",
  },
  dodo: {
    name: "Dodo Payments",
    keyLabel: "API key",
    newKeyLabel: "New API key",
    placeholder: "Read-only API key",
  },
  creem: {
    name: "Creem",
    keyLabel: "API key",
    newKeyLabel: "New API key",
    placeholder: "creem_...",
  },
  chargebee: {
    name: "Chargebee",
    keyLabel: "Read-only API key",
    newKeyLabel: "New read-only API key",
    placeholder: "live_...",
    account: { label: "Site", placeholder: "yoursite.chargebee.com" },
  },
  whop: {
    name: "Whop",
    keyLabel: "API key",
    newKeyLabel: "New API key",
    placeholder: "apik_...",
  },
  revenuecat: {
    name: "RevenueCat",
    keyLabel: "Secret API key",
    newKeyLabel: "New secret API key",
    placeholder: "sk_...",
    account: { label: "Project ID", placeholder: "proj1a2b3c4d" },
  },
  gumroad: {
    name: "Gumroad",
    keyLabel: "Gumroad account",
    newKeyLabel: "Another Gumroad account",
    placeholder: "",
    oauth: true,
  },
  // The key is the secret of an app of the founder's, and the account its Client ID.
  paypal: {
    name: "PayPal",
    keyLabel: "Secret",
    newKeyLabel: "New secret",
    placeholder: "Secret key 1",
    account: { label: "Client ID", placeholder: "Client ID of the app" },
  },
  // The key is an advanced access token, and the account the website profile it reads.
  mollie: {
    name: "Mollie",
    keyLabel: "Advanced access token",
    newKeyLabel: "New advanced access token",
    placeholder: "access_...",
    account: { label: "Profile ID", placeholder: "pfl_..." },
  },
  paystack: {
    name: "Paystack",
    keyLabel: "Restricted key",
    newKeyLabel: "New restricted key",
    placeholder: "rk_live_...",
  },
  // The key is the token of the Trust MRR app, which reaches only the public MRR figures.
  abacatepay: {
    name: "AbacatePay",
    keyLabel: "Trust MRR token",
    newKeyLabel: "New Trust MRR token",
    placeholder: "mrr_...",
  },
  asaas: {
    name: "Asaas",
    keyLabel: "API key",
    newKeyLabel: "New API key",
    placeholder: "$aact_prod_...",
  },
  // The key is a scoped API key, and the account the Client ID shown with it.
  airwallex: {
    name: "Airwallex",
    keyLabel: "Scoped API key",
    newKeyLabel: "New scoped API key",
    placeholder: "Scoped API key",
    account: { label: "Client ID", placeholder: "Client ID shown with your API keys" },
  },
  // The key is an organization API key, and the account the application it reads charts of.
  superwall: {
    name: "Superwall",
    keyLabel: "Organization API key",
    newKeyLabel: "New organization API key",
    placeholder: "sk_...",
    account: { label: "Application ID", placeholder: "App dashboard address or ID" },
  },
  // The key is the private key of a Team key, with its issuer, Key ID and the team's vendor number.
  appstore: {
    name: "App Store",
    keyLabel: "Private key",
    newKeyLabel: "New private key",
    placeholder: "Contents of the .p8 file",
    account: { label: "Issuer ID", placeholder: "57246542-96fe-1a63-e053-0824d011072a" },
    extra: [
      { label: "Key ID", placeholder: "2X9R4HXF34" },
      { label: "Vendor number", placeholder: "85012345" },
    ],
  },
  // The key is a service account's JSON key, the account the reports bucket, and the further
  // field the app's package names.
  googleplay: {
    name: "Google Play",
    keyLabel: "Service account JSON key",
    newKeyLabel: "New service account JSON key",
    placeholder: '{"type": "service_account", ...}',
    account: { label: "Cloud Storage URI", placeholder: "gs://pubsite_prod_rev_..." },
    extra: [{ label: "Package name", placeholder: "com.example.app" }],
  },
  zoho: {
    name: "Zoho Billing",
    keyLabel: "Zoho Billing account",
    newKeyLabel: "Another Zoho Billing organization",
    placeholder: "",
    oauth: true,
  },
  mercadopago: {
    name: "Mercado Pago",
    keyLabel: "Mercado Pago account",
    newKeyLabel: "Another Mercado Pago account",
    placeholder: "",
    oauth: true,
  },
} as const satisfies Record<string, ProviderEntry>;

type ProviderField = { label: string; placeholder: string };
type ProviderEntry = {
  name: string;
  keyLabel: string;
  newKeyLabel: string;
  placeholder: string;
  account?: ProviderField;
  extra?: readonly ProviderField[];
  oauth?: true;
};

export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(PROVIDERS, value);
}

/**
 * What the product form's list offers: a supported provider, or Other, for a founder whose
 * provider is not supported and who writes its name instead.
 */
export type ProviderOption = ProviderId | "other";

export function isProviderOption(value: unknown): value is ProviderOption {
  return value === "other" || isProviderId(value);
}

/** Why a product form without a payment provider was not saved. */
export const CHOOSE_PROVIDER =
  "Choose your payment provider. If it is not in the list, choose Other.";

/** A provider's name for people; unknown or missing values read as a payment provider. */
export function providerName(id: string | null | undefined) {
  return isProviderId(id) ? PROVIDERS[id].name : "a payment provider";
}

/** The second field a provider needs besides the key, or null. */
export function providerAccount(id: ProviderId): { label: string; placeholder: string } | null {
  const provider = PROVIDERS[id];
  return "account" in provider ? provider.account : null;
}

/** The fields a provider asks for after the account, in order; empty for most. */
export function providerExtra(id: ProviderId): readonly ProviderField[] {
  const provider: ProviderEntry = PROVIDERS[id];
  return provider.extra ?? [];
}

/** Whether a provider is connected through OAuth rather than with a pasted key. */
export function connectsWithOAuth(id: ProviderId) {
  return "oauth" in PROVIDERS[id];
}

/** How the figures are read, for "Verified with Gumroad through read-only access". */
export function providerAccess(id: string | null | undefined) {
  return isProviderId(id) && connectsWithOAuth(id) ? "read-only access" : "a read-only key";
}

/** Every provider's name in a sentence, such as "Stripe, Paddle or Polar". */
export function providerList(conjunction: "and" | "or") {
  const names = PROVIDER_IDS.map((id) => PROVIDERS[id].name);
  return `${names.slice(0, -1).join(", ")} ${conjunction} ${names.at(-1)}`;
}
