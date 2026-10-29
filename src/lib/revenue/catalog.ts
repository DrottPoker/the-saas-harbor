// The payment providers that can verify revenue, with what makers see of them. Safe for the
// browser: it holds names and the form's fields only; their words are messages in the `providers`
// namespace, per provider (`providers.<id>`: key labels, the steps, notes), with the fields'
// labels under `providers.fields`. `account` is a second field some providers need besides the
// key, such as the site or project the key belongs to, and `extra` any further fields after it. A
// placeholder is a sample of the value, the same in every language, or `placeholderText`, words
// under `providers.placeholders`. A provider with `oauth` is connected by approving access with
// the provider rather than by pasting a key.
export const PROVIDERS = {
  stripe: { name: "Stripe", placeholder: "rk_live_..." },
  paddle: { name: "Paddle", placeholder: "pdl_live_apikey_..." },
  polar: { name: "Polar", placeholder: "polar_oat_..." },
  dodo: { name: "Dodo Payments", placeholderText: "dodoKey" },
  creem: { name: "Creem", placeholder: "creem_..." },
  chargebee: {
    name: "Chargebee",
    placeholder: "live_...",
    account: { label: "site", placeholder: "yoursite.chargebee.com" },
  },
  whop: { name: "Whop", placeholder: "apik_..." },
  revenuecat: {
    name: "RevenueCat",
    placeholder: "sk_...",
    account: { label: "projectId", placeholder: "proj1a2b3c4d" },
  },
  gumroad: { name: "Gumroad", oauth: true },
  // The key is the secret of an app of the founder's, and the account its Client ID.
  paypal: {
    name: "PayPal",
    // PayPal's own name for the secret, which its dashboard shows in English.
    placeholder: "Secret key 1",
    account: { label: "clientId", placeholderText: "paypalAccount" },
  },
  // The key is an advanced access token, and the account the website profile it reads.
  mollie: {
    name: "Mollie",
    placeholder: "access_...",
    account: { label: "profileId", placeholder: "pfl_..." },
  },
  paystack: { name: "Paystack", placeholder: "rk_live_..." },
  // The key is the token of the Trust MRR app, which reaches only the public MRR figures.
  abacatepay: { name: "AbacatePay", placeholder: "mrr_..." },
  asaas: { name: "Asaas", placeholder: "$aact_prod_..." },
  // The key is a scoped API key, and the account the Client ID shown with it.
  airwallex: {
    name: "Airwallex",
    placeholderText: "airwallexKey",
    account: { label: "clientId", placeholderText: "airwallexAccount" },
  },
  // The key is an organization API key, and the account the application it reads charts of.
  superwall: {
    name: "Superwall",
    placeholder: "sk_...",
    account: { label: "applicationId", placeholderText: "superwallAccount" },
  },
  // The key is the private key of a Team key, with its issuer, Key ID and the team's vendor number.
  appstore: {
    name: "App Store",
    placeholderText: "appstoreKey",
    account: { label: "issuerId", placeholder: "57246542-96fe-1a63-e053-0824d011072a" },
    extra: [
      { label: "keyId", placeholder: "2X9R4HXF34" },
      { label: "vendorNumber", placeholder: "85012345" },
    ],
  },
  // The key is a service account's JSON key, the account the reports bucket, and the further
  // field the app's package names.
  googleplay: {
    name: "Google Play",
    placeholder: '{"type": "service_account", ...}',
    account: { label: "cloudStorageUri", placeholder: "gs://pubsite_prod_rev_..." },
    extra: [{ label: "packageName", placeholder: "com.example.app" }],
  },
  zoho: { name: "Zoho Billing", oauth: true },
  mercadopago: { name: "Mercado Pago", oauth: true },
} as const satisfies Record<string, ProviderEntry>;

/** A field's label, under `providers.fields`. */
type FieldLabel =
  | "site"
  | "projectId"
  | "clientId"
  | "profileId"
  | "applicationId"
  | "issuerId"
  | "keyId"
  | "vendorNumber"
  | "cloudStorageUri"
  | "packageName";
/** A placeholder in words, under `providers.placeholders`. */
type PlaceholderText =
  | "dodoKey"
  | "paypalAccount"
  | "airwallexKey"
  | "airwallexAccount"
  | "superwallAccount"
  | "appstoreKey";
type Placeholder = { placeholder?: string; placeholderText?: PlaceholderText };
export type ProviderField = Placeholder & { label: FieldLabel };
type ProviderEntry = Placeholder & {
  name: string;
  account?: ProviderField;
  extra?: readonly ProviderField[];
  oauth?: true;
};

export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** The providers connected through OAuth, and those connected with a pasted key. */
export type OAuthProviderId = {
  [K in ProviderId]: (typeof PROVIDERS)[K] extends { oauth: true } ? K : never;
}[ProviderId];
export type KeyProviderId = Exclude<ProviderId, OAuthProviderId>;

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

/**
 * Why a product form without a payment provider was not saved, in English, as the server refuses
 * a choice that is not in the list. Pages show `providers.choose`, the same words translated.
 */
export const CHOOSE_PROVIDER =
  "Choose your payment provider. If it is not in the list, choose Other.";

/**
 * A provider's name for people; unknown or missing values read as the fallback: "a payment
 * provider" in English, for stored and English-only texts, or `providers.fallback` translated.
 */
export function providerName(id: string | null | undefined, fallback = "a payment provider") {
  return isProviderId(id) ? PROVIDERS[id].name : fallback;
}

/** The second field a provider needs besides the key, or null. */
export function providerAccount(id: ProviderId): ProviderField | null {
  const provider: ProviderEntry = PROVIDERS[id];
  return provider.account ?? null;
}

/** The fields a provider asks for after the account, in order; empty for most. */
export function providerExtra(id: ProviderId): readonly ProviderField[] {
  const provider: ProviderEntry = PROVIDERS[id];
  return provider.extra ?? [];
}

/** The placeholder of a provider's key field: a sample, or words under `providers.placeholders`. */
export function providerKeyPlaceholder(id: KeyProviderId): Placeholder {
  const provider: ProviderEntry = PROVIDERS[id];
  return { placeholder: provider.placeholder, placeholderText: provider.placeholderText };
}

/** Whether a provider is connected through OAuth rather than with a pasted key. */
export function connectsWithOAuth(id: ProviderId): id is OAuthProviderId {
  return "oauth" in PROVIDERS[id];
}

/**
 * How the figures are read: approved access for a provider connected through OAuth, else a key.
 * Pages say it with `providers.verifiedWith`.
 */
export function providerAccessKind(id: string | null | undefined): "oauth" | "key" {
  return isProviderId(id) && connectsWithOAuth(id) ? "oauth" : "key";
}

/** How the figures are read, in English, for "Verified with Gumroad through read-only access". */
export function providerAccess(id: string | null | undefined) {
  return providerAccessKind(id) === "oauth" ? "read-only access" : "a read-only key";
}

/**
 * The providers' names, for a list in the page's language (`format.list` in next-intl): every
 * provider, or the ones given, such as those this server can connect (`availableProviders`).
 */
export function providerNames(ids: readonly ProviderId[] = PROVIDER_IDS) {
  return ids.map((id) => PROVIDERS[id].name);
}

/**
 * The providers' names in an English sentence, such as "Stripe, Paddle or Polar", for text that is
 * the same for everyone: Markdown, llms.txt and sharing images.
 */
export function providerList(conjunction: "and" | "or", ids: readonly ProviderId[] = PROVIDER_IDS) {
  const names = ids.map((id) => PROVIDERS[id].name);
  return `${names.slice(0, -1).join(", ")} ${conjunction} ${names.at(-1)}`;
}
