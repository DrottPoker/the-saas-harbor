import "server-only";
import { createHash } from "node:crypto";
import { VerificationError } from "../errors";
import { apiBase } from "../http";
import { oauthCallbackUrl, type OAuthProvider } from "../oauth";
import type { ParsedKey } from "../types";
import { fetchUser, mercadoPagoApiBase } from "./client";
import { encodeMercadoPagoKey, mercadoPagoHint, type MercadoPagoKey } from "./key";

// Connecting Mercado Pago through OAuth. A seller's own access token can do anything on the
// account, so a founder approves access for this site's application instead, which Mercado Pago
// lets the site's owner limit to the read and offline_access permissions: a token that reads
// subscriptions and payments, and a refresh token to renew it. The scopes come from the
// application, not the request, and every token issued is checked for them. The code exchange and
// the renewal (`POST /oauth/token`, the owner's approval of 2026-10-27) are the only requests to
// Mercado Pago that are not GETs; they issue tokens and change nothing in the account.

/** What a token must hold, and all it may hold. */
export const READ_SCOPES = ["read", "offline_access"] as const;

/** How long an access token lasts where Mercado Pago does not say: its documented 180 days. */
const DEFAULT_LIFETIME = 180 * 86_400;

/** This site's OAuth application with Mercado Pago, or null when it is not set up. */
export function mercadoPagoClient() {
  const id = process.env.MERCADOPAGO_CLIENT_ID;
  const secret = process.env.MERCADOPAGO_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export type MercadoPagoClient = { id: string; secret: string };

// The page where founders approve access; an override points at the browser tests' fake server.
function authorizeBase() {
  return apiBase(
    process.env.MERCADOPAGO_OAUTH_BASE,
    "https://auth.mercadopago.com",
    "Mercado Pago",
  );
}

/**
 * The page where the founder approves read access, with the state to check on the way back and the
 * PKCE challenge (S256) for the verifier, which the application must have PKCE turned on for.
 * `redirectUri` must be one of the application's redirect URLs exactly.
 */
export function mercadoPagoAuthorizeUrl(
  clientId: string,
  { state, verifier, redirectUri }: { state: string; verifier: string; redirectUri: string },
) {
  const url = new URL(`${authorizeBase()}/authorization`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Whether a token's scopes are reading and renewal, and nothing that can change the account. */
export function readOnlyScopes(scopes: string[]) {
  const allowed: readonly string[] = READ_SCOPES;
  return (
    READ_SCOPES.every((scope) => scopes.includes(scope)) &&
    scopes.every((scope) => allowed.includes(scope))
  );
}

/** A token request that failed; `refused` when Mercado Pago turned the code or refresh token down. */
export class MercadoPagoTokenError extends VerificationError {
  constructor(
    message: string,
    readonly refused: boolean,
  ) {
    super(message);
  }
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  scope?: string;
  user_id?: number | string;
  live_mode?: boolean;
};

async function requestToken(body: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(`${mercadoPagoApiBase()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new MercadoPagoTokenError("Mercado Pago could not be reached. Try again shortly.", false);
  }
  const result = (await response.json().catch(() => null)) as
    (TokenResponse & { error?: unknown }) | null;
  if (response.ok && typeof result?.access_token === "string") return result;
  const code = typeof result?.error === "string" ? result.error : "";
  if (response.status === 429)
    throw new MercadoPagoTokenError(
      "Mercado Pago is rate limiting requests. Try again later.",
      false,
    );
  if (code === "invalid_client") {
    console.error("Mercado Pago refused this site's OAuth application credentials.");
    throw new MercadoPagoTokenError(
      "Mercado Pago verification is not configured correctly on this server.",
      false,
    );
  }
  throw new MercadoPagoTokenError(
    "Mercado Pago did not issue access. Connect Mercado Pago again.",
    code === "invalid_grant" || code === "unauthorized_client",
  );
}

/** The tokens of a response, which must only read, for the account given or the one named. */
function issuedKey(result: TokenResponse, now: Date, userId: string | null): MercadoPagoKey {
  const scopes = typeof result.scope === "string" ? result.scope.split(/\s+/).filter(Boolean) : [];
  if (!readOnlyScopes(scopes)) {
    // Scope names only, never the tokens.
    console.warn("Mercado Pago issued access with these scopes:", scopes.join(" ") || "none");
    throw new VerificationError(
      "Mercado Pago granted this site other access than reading, so the access was not used.",
    );
  }
  const named = result.user_id == null ? null : String(result.user_id);
  if (userId && named && named !== userId)
    throw new VerificationError("Mercado Pago issued access for another account. Try again.");
  const lifetime = Number(result.expires_in);
  return {
    accessToken: result.access_token ?? "",
    refreshToken: result.refresh_token ?? "",
    expiresAt:
      Math.floor(now.getTime() / 1000) +
      (Number.isFinite(lifetime) && lifetime > 0 ? Math.floor(lifetime) : DEFAULT_LIFETIME),
    userId: userId ?? named ?? "",
  };
}

/**
 * Exchanges the code Mercado Pago returned, with the PKCE verifier, for tokens that must only
 * read. Test accounts (a token in test mode, or a test user) are refused unless test keys are
 * allowed. Returns the stored key, its hint and whether it is live.
 */
export async function exchangeMercadoPagoCode(
  client: MercadoPagoClient,
  { code, verifier, redirectUri }: { code: string; verifier: string; redirectUri: string },
  { allowTest, now = new Date() }: { allowTest: boolean; now?: Date },
): Promise<ParsedKey> {
  let result: TokenResponse;
  try {
    result = await requestToken({
      client_id: client.id,
      client_secret: client.secret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
  } catch (error) {
    if (error instanceof MercadoPagoTokenError && !error.refused) throw error;
    throw new VerificationError("Mercado Pago did not complete the connection. Try again.");
  }
  const issued = issuedKey(result, now, null);
  const user = await fetchUser(issued.accessToken);
  const key = { ...issued, userId: issued.userId || String(user.id) };
  if (String(user.id) !== key.userId)
    throw new VerificationError("Mercado Pago issued access for another account. Try again.");
  const test = result.live_mode === false || !!user.tags?.includes("test_user");
  if (test && !allowTest)
    throw new VerificationError(
      "This is a Mercado Pago test account. Connect the account that receives your payments.",
    );
  return { key: encodeMercadoPagoKey(key), hint: mercadoPagoHint(key.userId), livemode: !test };
}

/**
 * Renews the access token with the refresh token, which then stops working, so the new pair must
 * be stored. The new token must only read, and belong to the same account.
 */
export async function refreshMercadoPagoKey(
  client: MercadoPagoClient,
  key: MercadoPagoKey,
  now = new Date(),
): Promise<MercadoPagoKey> {
  const result = await requestToken({
    client_id: client.id,
    client_secret: client.secret,
    grant_type: "refresh_token",
    refresh_token: key.refreshToken,
  });
  // Without a new refresh token the renewal cannot be stored, so it counts as one that failed.
  if (typeof result.refresh_token !== "string")
    throw new MercadoPagoTokenError("Mercado Pago did not renew access. Try again later.", false);
  return issuedKey(result, now, key.userId);
}

/** Mercado Pago in the shared OAuth flow, with the routes under /api/mercadopago. */
export const mercadopagoOAuth: OAuthProvider = {
  id: "mercadopago",
  client: mercadoPagoClient,
  authorizeUrl: (client, { state, verifier }) =>
    mercadoPagoAuthorizeUrl(client.id, {
      state,
      verifier,
      redirectUri: oauthCallbackUrl("mercadopago"),
    }),
  exchange: (client, { code, verifier, allowTest }) =>
    exchangeMercadoPagoCode(
      client,
      { code, verifier, redirectUri: oauthCallbackUrl("mercadopago") },
      { allowTest },
    ),
};
