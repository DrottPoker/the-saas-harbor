import "server-only";
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
 * A provider's API origin, or the browser tests' fake server. An override must use https in
 * production, so a wrong setting cannot send keys in the clear.
 */
export function apiBase(override: string | undefined, origin: string, name: string) {
  if (!override) return origin;
  if (process.env.NODE_ENV === "production" && !override.startsWith("https://"))
    throw new VerificationError(`${name} verification is not configured correctly on this server.`);
  return override.replace(/\/$/, "");
}

// Requests to one provider start at least this many milliseconds apart in this process. Paddle
// limits each IP address to 240 requests a minute and Dodo each business to 240, so reads leave
// room for other makers and the makers' own use; Polar allows 500 per organization.
const SPACING: Partial<Record<ProviderId, number>> = { paddle: 300, polar: 150, dodo: 300 };
const nextSlot = new Map<ProviderId, number>();

async function throttle(provider: ProviderId) {
  const gap = SPACING[provider];
  if (!gap) return;
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(provider) ?? 0);
  nextSlot.set(provider, slot + gap);
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

/** A GET request with a timeout, spaced out per provider. Only ever reads. */
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
