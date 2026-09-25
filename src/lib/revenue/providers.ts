import "server-only";
import type { ProviderId } from "./catalog";
import { dodo } from "./dodo";
import { paddle } from "./paddle";
import { polar } from "./polar";
import { stripe } from "./stripe";
import type { ProviderAdapter } from "./types";

const ADAPTERS: Record<ProviderId, ProviderAdapter> = { stripe, paddle, polar, dodo };

/** How to validate a provider's keys and read its accounts. */
export function adapter(provider: ProviderId) {
  return ADAPTERS[provider];
}
