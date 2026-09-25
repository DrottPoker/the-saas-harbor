// The payment providers that can verify revenue, with what makers see of them. Safe for the
// browser: it holds names and labels only.
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
} as const;

export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(PROVIDERS, value);
}

/** A provider's name for people; unknown or missing values read as a payment provider. */
export function providerName(id: string | null | undefined) {
  return isProviderId(id) ? PROVIDERS[id].name : "a payment provider";
}
