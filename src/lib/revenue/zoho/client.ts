import "server-only";
import { createHash } from "node:crypto";
import { VerificationError } from "../errors";
import {
  apiBase,
  errorBody,
  providerGet,
  ProviderRequestError,
  rateLimited,
  returnedError,
  tooMuchData,
  unreachable,
} from "../http";
import type { OAuthClient } from "../oauth";
import { DATA_CENTRES, readZohoKey, type DataCentre } from "./key";
import type { ZohoSubscription } from "./mrr";
import type { ZohoPayment } from "./payments";

// Zoho Billing (formerly Zoho Subscriptions), through this site's OAuth application with Zoho.
// Each data centre has its own accounts server and API domain; the overrides point both at the
// browser tests' fake server, with the data centre after them, as `/in` for India.

/** This site's OAuth application with Zoho, or null when it is not set up. */
export function zohoClient(): OAuthClient | null {
  const id = process.env.ZOHO_CLIENT_ID;
  const secret = process.env.ZOHO_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export function accountsBase(dc: DataCentre) {
  const override = process.env.ZOHO_ACCOUNTS_BASE;
  if (override) return `${apiBase(override, "", "Zoho Billing")}/${dc}`;
  return DATA_CENTRES[dc].accounts;
}

function billingBase(dc: DataCentre) {
  const override = process.env.ZOHO_API_BASE;
  const origin = override ? `${apiBase(override, "", "Zoho Billing")}/${dc}` : DATA_CENTRES[dc].api;
  return `${origin}/billing/v1`;
}

/**
 * The scopes this site asks for: reading the organizations (settings), the subscriptions and the
 * customer payments. Zoho has no scope that can only read other than these per-module READ ones.
 */
export const ZOHO_SCOPES = [
  "ZohoSubscriptions.settings.READ",
  "ZohoSubscriptions.subscriptions.READ",
  "ZohoSubscriptions.payments.READ",
];

/** The scopes of a token response, which Zoho separates with commas or spaces. */
export function scopeList(scope: unknown) {
  return typeof scope === "string" ? scope.split(/[\s,]+/).filter(Boolean) : [];
}

/** Whether scopes hold everything a verification reads and nothing but READ access. */
export function readOnlyScopes(scopes: string[]) {
  return (
    ZOHO_SCOPES.every((scope) => scopes.includes(scope)) &&
    scopes.every((scope) => scope.split(".").at(-1)?.toUpperCase() === "READ")
  );
}

export function requireReadOnly(scopes: string[]) {
  if (!readOnlyScopes(scopes)) throw new VerificationError("zoho.beyondRead");
}

export type ZohoTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  api_domain?: string;
  expires_in?: number;
  error?: string;
};

/**
 * A token from Zoho's accounts server: for the code when connecting, and from the refresh token on
 * every read. These are the only requests sent to Zoho that are not GETs (the owner's approval of
 * 2026-10-27); they issue tokens and change nothing in the account. Zoho answers most failures
 * with an `error` and status 200, so the caller reads the body.
 */
export async function requestToken(dc: DataCentre, params: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(`${accountsBase(dc)}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(params),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw unreachable("Zoho");
  }
  const body = (await response.json().catch(() => null)) as ZohoTokenResponse | null;
  // Zoho issues ten access tokens per refresh token in ten minutes, then blocks it for the rest.
  if (response.status === 429 || /too many|access denied/i.test(body?.error ?? ""))
    throw rateLimited("Zoho");
  return { ok: response.ok && typeof body?.access_token === "string", body: body ?? {} };
}

// Access tokens last an hour. Each is kept, under a hash of the stored key, until five minutes
// before it expires, so the reads of one verification share it.
const tokens = new Map<string, { token: string; until: number }>();
const tokenKey = (stored: string) => createHash("sha256").update(stored).digest("hex");

/** Keeps an access token Zoho issued for a stored key. */
export function rememberToken(stored: string, token: string, expiresIn: number | undefined) {
  const now = Date.now();
  for (const [key, entry] of tokens) if (entry.until <= now) tokens.delete(key);
  const seconds = Math.min(Number(expiresIn) || 3600, 3600) - 300;
  if (seconds > 0) tokens.set(tokenKey(stored), { token, until: now + seconds * 1000 });
}

/**
 * An access token for a stored connection. Where Zoho says which scopes the refresh token holds,
 * they are checked again; it does not say on every refresh, so the scopes are checked in full when
 * connecting, and a refresh token keeps the scopes it was granted with.
 */
export async function accessToken(stored: string) {
  const cached = tokens.get(tokenKey(stored));
  if (cached && cached.until > Date.now()) return cached.token;
  const app = zohoClient();
  if (!app) throw new VerificationError("common.notSetUp", { provider: "Zoho Billing" });
  const { dc, refreshToken } = readZohoKey(stored);
  const { ok, body } = await requestToken(dc, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: app.id,
    client_secret: app.secret,
  });
  if (!ok) {
    if (body.error === "invalid_code")
      throw new ProviderRequestError("zoho.connectionRevoked", {}, { status: 401 });
    throw new ProviderRequestError("zoho.noAccess");
  }
  if (body.scope !== undefined) requireReadOnly(scopeList(body.scope));
  rememberToken(stored, body.access_token!, body.expires_in);
  return body.access_token!;
}

type Envelope = { code?: number; message?: string; page_context?: { has_more_page?: boolean } };

/**
 * A GET request to Zoho Billing, for an organization where `organizationId` is given. Every
 * response carries a `code`, 0 on success.
 */
export async function zohoGet<T>(
  token: string,
  dc: DataCentre,
  path: string,
  params: Record<string, string>,
  organizationId: string | null,
) {
  const url = new URL(`${billingBase(dc)}${path}`);
  url.search = new URLSearchParams(params).toString();
  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    Accept: "application/json",
  };
  if (organizationId) headers["X-com-zoho-subscriptions-organizationid"] = organizationId;
  const response = await providerGet("zoho", "Zoho Billing", url, headers);
  const body = (
    response.ok ? await response.json().catch(() => null) : await errorBody(response)
  ) as (Envelope & T) | null;
  const message = typeof body?.message === "string" ? body.message.slice(0, 300) : null;
  if (response.status === 401)
    throw new ProviderRequestError("zoho.accessRefused", {}, { status: 401 });
  if (response.status === 403)
    throw new ProviderRequestError(
      "common.connectionCannotRead",
      { provider: "Zoho Billing" },
      { status: 403, path },
    );
  if (response.status === 429)
    // Code 45: the organization's API calls for the day are used up.
    throw body?.code === 45
      ? new ProviderRequestError("zoho.dailyLimit", {}, { status: 429 })
      : rateLimited("Zoho Billing");
  if (!response.ok || !body || body.code !== 0)
    throw returnedError("Zoho Billing", message, { status: response.status, path });
  return body;
}

/** Zoho Billing pages hold up to 200 items. */
const PER_PAGE = "200";

/** Every page of a list, until Zoho says there are no more, or `maxPages` is too few. */
async function listPages<T>(
  token: string,
  dc: DataCentre,
  organizationId: string,
  path: string,
  key: string,
  params: Record<string, string>,
  maxPages: number,
) {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const body = await zohoGet<Record<string, unknown>>(
      token,
      dc,
      path,
      { ...params, page: String(page), per_page: PER_PAGE },
      organizationId,
    );
    const list = body[key];
    if (Array.isArray(list)) items.push(...(list as T[]));
    if (!body.page_context?.has_more_page) return items;
  }
  throw tooMuchData("Zoho Billing", path);
}

export type ZohoOrganization = {
  organization_id: string | number;
  name?: string | null;
  is_default_org?: boolean | null;
  is_org_active?: boolean | null;
  currency_code?: string | null;
};

/** The organizations the founder's account belongs to. Scope: settings.READ. */
export async function fetchOrganizations(token: string, dc: DataCentre) {
  const body = await zohoGet<{ organizations?: ZohoOrganization[] }>(
    token,
    dc,
    "/organizations",
    {},
    null,
  );
  return body.organizations ?? [];
}

/** The organization a connection reads: the account's default one. */
export function defaultOrganization(organizations: ZohoOrganization[]) {
  const active = organizations.filter((org) => org.is_org_active !== false);
  return active.find((org) => org.is_default_org === true) ?? active[0] ?? null;
}

/** Most pages of one subscription status or the payments read in one run. */
const MAX_LIST_PAGES = 25;

/**
 * The subscriptions with each status that MRR counts. Zoho's filters name statuses for people, so
 * the statuses are checked again when MRR is computed. Scope: subscriptions.READ.
 */
export async function fetchSubscriptions(stored: string, token: string, filters: string[]) {
  const { dc, organizationId } = readZohoKey(stored);
  const lists: ZohoSubscription[][] = [];
  for (const filter of filters)
    lists.push(
      await listPages<ZohoSubscription>(
        token,
        dc,
        organizationId,
        "/subscriptions",
        "subscriptions",
        { filter_by: filter },
        MAX_LIST_PAGES,
      ),
    );
  return lists.flat();
}

/**
 * Every customer payment of the organization. The list has no documented date filter or order, so
 * it is read whole, at most `maxPages` pages. Scope: payments.READ.
 */
export async function fetchPayments(stored: string, token: string, maxPages: number) {
  const { dc, organizationId } = readZohoKey(stored);
  return listPages<ZohoPayment>(
    token,
    dc,
    organizationId,
    "/payments",
    "payments",
    {},
    Math.min(maxPages, MAX_LIST_PAGES),
  );
}

/** The organization's own currency, which a payment without a currency is in. */
export async function fetchOrganizationCurrency(stored: string, token: string) {
  const { dc, organizationId } = readZohoKey(stored);
  const organization = (await fetchOrganizations(token, dc)).find(
    (org) => String(org.organization_id) === organizationId,
  );
  return organization?.currency_code ?? null;
}
