// The payment providers that can verify revenue, with what makers see of them. Safe for the
// browser: it holds names and labels only. `account` is a second field some providers need
// besides the key, such as the site or project the key belongs to. A provider with `oauth` is
// connected by approving access with the provider rather than by pasting a key.
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
} as const satisfies Record<
  string,
  {
    name: string;
    keyLabel: string;
    newKeyLabel: string;
    placeholder: string;
    account?: { label: string; placeholder: string };
    oauth?: true;
  }
>;

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
