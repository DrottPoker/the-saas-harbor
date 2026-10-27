import "server-only";
import { connectsWithOAuth, PROVIDER_IDS, type ProviderId } from "./catalog";
import { gumroadOAuth } from "./gumroad/oauth";
import { mercadopagoOAuth } from "./mercadopago/oauth";
import { zohoOAuth } from "./zoho/oauth";

// Which providers this server can connect. A provider with a pasted key always can; one connected
// through OAuth needs the site's application with it, set up in the environment. The product form
// offers only these, and the site names only these, so no founder chooses one that cannot work.

/** The providers connected through OAuth that this server is set up for. */
export function oauthReadyProviders(): ProviderId[] {
  return [gumroadOAuth, zohoOAuth, mercadopagoOAuth]
    .filter((provider) => provider.client())
    .map((provider) => provider.id);
}

/** The providers founders can connect on this server, in the catalog's order. */
export function availableProviders(): ProviderId[] {
  const ready = oauthReadyProviders();
  return PROVIDER_IDS.filter((id) => !connectsWithOAuth(id) || ready.includes(id));
}
