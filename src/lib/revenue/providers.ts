import "server-only";
import { abacatepay } from "./abacatepay";
import { airwallex } from "./airwallex";
import { asaas } from "./asaas";
import type { ProviderId } from "./catalog";
import { chargebee } from "./chargebee";
import { creem } from "./creem";
import { dodo } from "./dodo";
import { gumroad } from "./gumroad";
import { mollie } from "./mollie";
import { paddle } from "./paddle";
import { paypal } from "./paypal";
import { paystack } from "./paystack";
import { polar } from "./polar";
import { revenuecat } from "./revenuecat";
import { stripe } from "./stripe";
import type { ProviderAdapter } from "./types";
import { whop } from "./whop";

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  stripe,
  paddle,
  polar,
  dodo,
  creem,
  chargebee,
  whop,
  revenuecat,
  gumroad,
  paypal,
  mollie,
  paystack,
  abacatepay,
  asaas,
  airwallex,
};

/** How to validate a provider's keys and read its accounts. */
export function adapter(provider: ProviderId) {
  return ADAPTERS[provider];
}
