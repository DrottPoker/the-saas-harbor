import "server-only";
import { isSecureOrLocalUrl } from "../loopback";
import type { ProviderId } from "./catalog";
import { VerificationError } from "./errors";

/** A failed request to a provider, in words for the maker. */
export class ProviderRequestError extends VerificationError {
  constructor(
    message: string,
    readonly status?: number,
    /** The endpoint that failed, such as /v1/prices/price_123. */
    readonly path?: string,
    /** A list had more pages than one run reads. */
    readonly tooMuchData = false,
  ) {
    super(message);
  }
}

/**
 * A provider's API origin, or the browser tests' fake server. An override must use https, or plain
 * http to this machine, so a wrong setting cannot send keys in the clear.
 */
export function apiBase(override: string | undefined, origin: string, name: string) {
  if (!override) return origin;
  if (!isSecureOrLocalUrl(override))
    throw new VerificationError(`${name} verification is not configured correctly on this server.`);
  return override.replace(/\/$/, "");
}

// Requests to one provider start at least this many milliseconds apart in this process. Paddle
// limits each IP address to 240 requests a minute and Dodo each business to 240, so reads leave
// room for other makers and the makers' own use; Polar allows 500 per organization. Chargebee
// allows 150 a minute on test sites and its smallest plan, Whop 600 per endpoint, and Creem
// publishes no limit, nor does Gumroad, whose sales come ten to a page, nor PayPal, which searches
// 31 days a request. RevenueCat allows 25 chart requests a minute per project; a run that also
// reads the revenue chart back to its first year sends fewer than 20, so they are not spaced.
// Mollie sets read limits per merchant, such as 20 payment lists a second.
// Paystack allows 600 requests a minute per live integration.
// AbacatePay publishes no limit, and a run sends at most four requests.
// Asaas allows 25,000 requests per account every 12 hours, shared with the founder's own use.
// Airwallex allows 20 requests a second per endpoint.
// Superwall publishes no limit, and a run sends four reads and two chart queries.
// Apple allows each key about 3,600 requests an hour.
// Google Play is read with a list and at most 26 downloads a run, so its requests are not spaced.
const SPACING: Partial<Record<ProviderId, number>> = {
  paddle: 300,
  polar: 150,
  dodo: 300,
  creem: 150,
  chargebee: 500,
  whop: 100,
  gumroad: 100,
  paypal: 200,
  mollie: 100,
  paystack: 300,
  abacatepay: 200,
  asaas: 250,
  airwallex: 100,
  superwall: 100,
  appstore: 200,
};
const nextSlot = new Map<ProviderId, number>();

async function throttle(provider: ProviderId) {
  const gap = SPACING[provider];
  if (!gap) return;
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(provider) ?? 0);
  nextSlot.set(provider, slot + gap);
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

/**
 * A GET request with a timeout, spaced out per provider. Only ever reads. The token requests for
 * Gumroad, PayPal and Google, the Airwallex login and Superwall's chart query are the only other
 * requests sent to providers (`gumroad/oauth.ts`, `paypal/client.ts`, `googleplay/client.ts`,
 * `airwallex/client.ts`, `superwall/client.ts`).
 */
export async function providerGet(
  provider: ProviderId,
  name: string,
  url: URL,
  headers: Record<string, string>,
) {
  await throttle(provider);
  try {
    return await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderRequestError(`${name} could not be reached. Try again shortly.`);
  }
}

/** Reads a JSON error body, or null when there is none. */
export async function errorBody(response: Response) {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

/** Most pages one list reads in one run, so a huge account cannot keep a check running. */
export const MAX_PAGES = 200;

export function tooMuchData(name: string, path: string) {
  return new ProviderRequestError(
    `The ${name} account has too much data to verify in one run.`,
    undefined,
    path,
    true,
  );
}
