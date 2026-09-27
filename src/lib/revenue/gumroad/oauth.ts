import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { siteUrl } from "@/lib/seo";
import { VerificationError } from "../errors";
import { apiBase } from "../http";
import { gumroadApiBase } from "./client";

// Connecting Gumroad through OAuth. Gumroad's personal access tokens can do anything on the account,
// so a founder approves access for this site instead, which asks for view_sales only: a token that
// reads products, subscribers and sales, and cannot change, refund or email anything. The code
// exchange is the one POST sent to Gumroad; it issues the token and changes nothing in the account.

/** What a token may hold: view_sales, and view_public, Gumroad's default. */
export const READ_SCOPES = new Set(["view_sales", "view_public"]);
const SCOPE = "view_sales";

/** The cookie that carries a connection in progress from the start to the callback. */
export const GUMROAD_FLOW_COOKIE = "harbor_gumroad_flow";
export const GUMROAD_FLOW_SECONDS = 600;

/**
 * The cookie that carries the outcome back to the product's editor for a minute: a message
 * written for the founder, never text from the address, which anyone could craft.
 */
export const GUMROAD_RESULT_COOKIE = "harbor_gumroad_result";
export type GumroadResult = { saasId: string; tone: "success" | "error"; text: string };

export function encodeGumroadResult(result: GumroadResult) {
  return Buffer.from(JSON.stringify(result)).toString("base64url");
}

export function decodeGumroadResult(value: string | undefined): GumroadResult | null {
  if (!value) return null;
  try {
    const result = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as GumroadResult;
    return typeof result.saasId === "string" &&
      (result.tone === "success" || result.tone === "error") &&
      typeof result.text === "string"
      ? result
      : null;
  } catch {
    return null;
  }
}

/** This site's OAuth application with Gumroad, or null when it is not set up. */
export function gumroadClient() {
  const id = process.env.GUMROAD_CLIENT_ID;
  const secret = process.env.GUMROAD_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

/** Where Gumroad sends the founder back, as registered with the application. */
export function gumroadCallbackUrl() {
  return `${siteUrl()}/api/gumroad/callback`;
}

// The pages where founders approve access; an override points at the browser tests' fake server.
function authorizeBase() {
  return apiBase(process.env.GUMROAD_OAUTH_BASE, "https://gumroad.com", "Gumroad");
}

export type GumroadFlow = {
  state: string;
  verifier: string;
  saasId: string;
  userId: string;
};

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/** A new connection for a product: its state, and the PKCE verifier its code needs. */
export function newGumroadFlow(saasId: string, userId: string): GumroadFlow {
  return {
    state: base64url(randomBytes(24)),
    verifier: base64url(randomBytes(48)),
    saasId,
    userId,
  };
}

export function encodeGumroadFlow(flow: GumroadFlow) {
  return Buffer.from(JSON.stringify(flow)).toString("base64url");
}

export function decodeGumroadFlow(value: string | undefined): GumroadFlow | null {
  if (!value) return null;
  try {
    const flow = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as GumroadFlow;
    return [flow.state, flow.verifier, flow.saasId, flow.userId].every(
      (part) => typeof part === "string" && part.length > 0,
    )
      ? flow
      : null;
  } catch {
    return null;
  }
}

/** The page where the founder approves read access to their sales. */
export function gumroadAuthorizeUrl(clientId: string, flow: GumroadFlow) {
  const url = new URL(`${authorizeBase()}/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", gumroadCallbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", flow.state);
  url.searchParams.set(
    "code_challenge",
    base64url(createHash("sha256").update(flow.verifier).digest()),
  );
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Whether a token's scopes allow reading sales and nothing that changes the account. */
export function readOnlyScopes(scopes: string[]) {
  return scopes.includes(SCOPE) && scopes.every((scope) => READ_SCOPES.has(scope));
}

/** Exchanges the code Gumroad returned for a token, which must only read. */
export async function exchangeGumroadCode(
  client: { id: string; secret: string },
  code: string,
  verifier: string,
) {
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
        redirect_uri: gumroadCallbackUrl(),
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
