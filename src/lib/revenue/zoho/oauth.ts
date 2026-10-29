import "server-only";
import { VerificationError } from "../errors";
import {
  oauthCallbackUrl,
  pkceChallenge,
  type OAuthCallback,
  type OAuthClient,
  type OAuthFlow,
  type OAuthProvider,
} from "../oauth";
import type { ParsedKey } from "../types";
import {
  accountsBase,
  defaultOrganization,
  fetchOrganizations,
  rememberToken,
  requestToken,
  requireReadOnly,
  scopeList,
  ZOHO_SCOPES,
  zohoClient,
} from "./client";
import { callbackDataCentre, zohoHint, zohoStoredKey } from "./key";

// Connecting Zoho Billing through OAuth: Zoho has no API key, so a founder approves access for this
// site, which asks for the READ scopes of settings, subscriptions and payments only, offline, so the
// refresh token keeps working without the founder. Approval starts in the US data centre, and Zoho
// sends the founder back with the data centre their account is in (`accounts-server`), where the
// code is exchanged. The organization read is the account's default one, whose name the
// connection's hint shows; to read another, the founder makes it the default in Zoho Billing and
// connects again.

/** The page where the founder approves read access, in the US data centre, as Zoho asks. */
export function zohoAuthorizeUrl(clientId: string, flow: OAuthFlow) {
  const url = new URL(`${accountsBase("com")}/oauth/v2/auth`);
  url.searchParams.set("scope", ZOHO_SCOPES.join(","));
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  // Asks every time, so Zoho issues a refresh token for every connection.
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("redirect_uri", oauthCallbackUrl("zoho"));
  url.searchParams.set("state", flow.state);
  url.searchParams.set("code_challenge", pkceChallenge(flow.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Exchanges the code at the founder's data centre for a refresh token that must only read, and
 * picks the organization. The access token that comes with it serves the first verification.
 */
export async function exchangeZohoCode(
  client: OAuthClient,
  { code, verifier, params }: OAuthCallback,
): Promise<ParsedKey> {
  const dc = callbackDataCentre(params);
  const { ok, body } = await requestToken(dc, {
    grant_type: "authorization_code",
    code,
    client_id: client.id,
    client_secret: client.secret,
    redirect_uri: oauthCallbackUrl("zoho"),
    code_verifier: verifier,
  });
  if (!ok || !body.refresh_token)
    throw new VerificationError("common.connectionNotCompleted", { provider: "Zoho" });
  // Zoho names the scopes it granted; without them the access cannot be shown to only read.
  requireReadOnly(scopeList(body.scope));
  const token = body.access_token!;
  const organization = defaultOrganization(await fetchOrganizations(token, dc));
  if (!organization) throw new VerificationError("zoho.noOrganization");
  const key = zohoStoredKey({
    dc,
    organizationId: String(organization.organization_id),
    refreshToken: body.refresh_token,
  });
  rememberToken(key, token, body.expires_in);
  return { key, hint: zohoHint(organization.name ?? "", body.refresh_token), livemode: true };
}

/**
 * Zoho Billing for the shared OAuth routes. Zoho's API does not mark an organization as a test one,
 * so every connection counts as live.
 */
export const zohoOAuth: OAuthProvider = {
  id: "zoho",
  client: zohoClient,
  authorizeUrl: (client, flow) => zohoAuthorizeUrl(client.id, flow),
  exchange: exchangeZohoCode,
};
