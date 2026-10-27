import "server-only";
import { VerificationError } from "../errors";
import { apiBase } from "../http";
import {
  oauthCallbackUrl,
  pkceChallenge,
  type OAuthClient,
  type OAuthFlow,
  type OAuthProvider,
} from "../oauth";
import { gumroadApiBase } from "./client";

// Connecting Gumroad through OAuth. Gumroad's personal access tokens can do anything on the account,
// so a founder approves access for this site instead, which asks for view_sales only: a token that
// reads products, subscribers and sales, and cannot change, refund or email anything. The code
// exchange is the one POST sent to Gumroad; it issues the token and changes nothing in the account.

/** What a token may hold: view_sales, and view_public, Gumroad's default. */
export const READ_SCOPES = new Set(["view_sales", "view_public"]);
const SCOPE = "view_sales";

// Gumroad's flows are the shared ones; the name stays for the tests that connect Gumroad.
export { newOAuthFlow as newGumroadFlow } from "../oauth";

/** This site's OAuth application with Gumroad, or null when it is not set up. */
export function gumroadClient(): OAuthClient | null {
  const id = process.env.GUMROAD_CLIENT_ID;
  const secret = process.env.GUMROAD_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

// The pages where founders approve access; an override points at the browser tests' fake server.
function authorizeBase() {
  return apiBase(process.env.GUMROAD_OAUTH_BASE, "https://gumroad.com", "Gumroad");
}

/** The page where the founder approves read access to their sales. */
export function gumroadAuthorizeUrl(clientId: string, flow: OAuthFlow) {
  const url = new URL(`${authorizeBase()}/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", oauthCallbackUrl("gumroad"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", flow.state);
  url.searchParams.set("code_challenge", pkceChallenge(flow.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Whether a token's scopes allow reading sales and nothing that changes the account. */
export function readOnlyScopes(scopes: string[]) {
  return scopes.includes(SCOPE) && scopes.every((scope) => READ_SCOPES.has(scope));
}

/** Exchanges the code Gumroad returned for a token, which must only read. */
export async function exchangeGumroadCode(client: OAuthClient, code: string, verifier: string) {
  let response: Response;
  try {
    response = await fetch(`${gumroadApiBase()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: client.id,
        client_secret: client.secret,
        redirect_uri: oauthCallbackUrl("gumroad"),
        code_verifier: verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new VerificationError("Gumroad could not be reached. Try again shortly.");
  }
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    scope?: string;
  } | null;
  if (!response.ok || !body?.access_token)
    throw new VerificationError("Gumroad did not complete the connection. Try again.");
  const scopes = (body.scope ?? "").split(/\s+/).filter(Boolean);
  if (!readOnlyScopes(scopes))
    throw new VerificationError(
      "Gumroad granted other access than reading sales, so the connection was not saved. Try again.",
    );
  return { token: body.access_token, hint: `…${body.access_token.slice(-4)}` };
}

/** Gumroad for the shared OAuth routes. Its tokens do not expire and are always live. */
export const gumroadOAuth: OAuthProvider = {
  id: "gumroad",
  client: gumroadClient,
  authorizeUrl: (client, flow) => gumroadAuthorizeUrl(client.id, flow),
  async exchange(client, { code, verifier }) {
    const { token, hint } = await exchangeGumroadCode(client, code, verifier);
    return { key: token, hint, livemode: true };
  },
};
