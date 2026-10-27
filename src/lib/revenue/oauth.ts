import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { siteUrl } from "@/lib/seo";
import type { ProviderId } from "./catalog";
import type { ParsedKey } from "./types";

// Connecting a payment provider through OAuth rather than with a pasted key: what every such
// provider shares. A provider describes itself as an `OAuthProvider` in its own `oauth.ts` and gets
// two thin routes, `src/app/api/<id>/connect/route.ts` and `src/app/api/<id>/callback/route.ts`,
// which call `startOAuth` and `finishOAuth` in `oauth-routes.ts` with it. The product form sends a
// founder to `/api/<id>/connect?saas=<id>` (`saveSaas`), so every provider's routes live there,
// and `/api/<id>/callback` is the address registered with the provider. This module imports nothing
// of the app beyond the site's address, so provider modules and their adapters can use it freely.

/** This site's OAuth application with a provider, from the environment. */
export type OAuthClient = { id: string; secret: string };

/**
 * A connection in progress, carried in a cookie from the start to the callback: a random state,
 * the PKCE verifier its code needs, and the product and founder it was started for.
 */
export type OAuthFlow = { state: string; verifier: string; saasId: string; userId: string };

/**
 * What the callback hands the provider to exchange: the code, the flow's verifier, the whole
 * query, and whether test accounts may connect, as test keys may where the server allows them.
 */
export type OAuthCallback = {
  code: string;
  verifier: string;
  params: URLSearchParams;
  allowTest: boolean;
};

/**
 * A payment provider connected through OAuth. The shared routes check the founder, the state and
 * the product, count the check, and connect what `exchange` returns through `connectProvider`,
 * which verifies it with the provider's adapter before storing it encrypted like any key.
 */
export type OAuthProvider = {
  /** Also names the routes (`/api/<id>/...`) and the flow cookie (`harbor_<id>_flow`). */
  id: ProviderId;
  /** This site's application with the provider, or null when the server is not set up for it. */
  client(): OAuthClient | null;
  /**
   * The provider's page where the founder approves read access: with `flow.state`, the PKCE
   * challenge of `flow.verifier` where the provider supports it (`pkceChallenge`), and
   * `oauthCallbackUrl(id)` as the redirect address.
   */
  authorizeUrl(client: OAuthClient, flow: OAuthFlow): string;
  /**
   * Exchanges the code for what is stored: the key that later reads use (stored encrypted, never
   * shown), a short hint for the founder, and whether it is live. Throws a `VerificationError`
   * for access that can do more than read, or that the provider did not grant.
   */
  exchange(client: OAuthClient, callback: OAuthCallback): Promise<ParsedKey>;
};

/** How long a founder has to approve access before the flow expires. */
export const OAUTH_FLOW_SECONDS = 600;

/** The cookie that carries a provider's flow, scoped to its routes. */
export function oauthFlowCookie(id: ProviderId) {
  return { name: `harbor_${id}_flow`, path: `/api/${id}` };
}

/** Where the provider sends the founder back, as registered with the application. */
export function oauthCallbackUrl(id: ProviderId) {
  return `${siteUrl()}/api/${id}/callback`;
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/** A new connection for a product: its state, and the PKCE verifier its code needs. */
export function newOAuthFlow(saasId: string, userId: string): OAuthFlow {
  return {
    state: base64url(randomBytes(24)),
    verifier: base64url(randomBytes(48)),
    saasId,
    userId,
  };
}

export function encodeOAuthFlow(flow: OAuthFlow) {
  return Buffer.from(JSON.stringify(flow)).toString("base64url");
}

export function decodeOAuthFlow(value: string | undefined): OAuthFlow | null {
  if (!value) return null;
  try {
    const flow = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as OAuthFlow;
    return [flow.state, flow.verifier, flow.saasId, flow.userId].every(
      (part) => typeof part === "string" && part.length > 0,
    )
      ? flow
      : null;
  } catch {
    return null;
  }
}

/** The S256 challenge of a PKCE verifier. */
export function pkceChallenge(verifier: string) {
  return base64url(createHash("sha256").update(verifier).digest());
}
