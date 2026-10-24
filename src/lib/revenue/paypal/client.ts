import "server-only";
import { VerificationError } from "../errors";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import { SUBSCRIPTION_PAYMENT, type PayPalTransaction } from "./mrr";

// PayPal has one address for live apps and one for the sandbox, and an app's credentials work in
// their own only.
const ORIGINS = { live: "https://api-m.paypal.com", sandbox: "https://api-m.sandbox.paypal.com" };

function base(livemode: boolean) {
  const override = process.env.PAYPAL_API_BASE;
  if (override) return `${apiBase(override, "", "PayPal")}/${livemode ? "live" : "sandbox"}`;
  return livemode ? ORIGINS.live : ORIGINS.sandbox;
}

export type PayPalCredentials = { clientId: string; secret: string };

/** The scope that searches transactions, which the app's Transaction search feature grants. */
export const SEARCH_SCOPE = "https://uri.paypal.com/services/reporting/search/read";

/**
 * Whether a scope only reads: PayPal's reports, signing in with PayPal, and the app's own webhooks,
 * which only report what happened and which every app may set up.
 */
export function readsOnly(scope: string) {
  return (
    /^https:\/\/uri\.paypal\.com\/services\/reporting\/[a-z0-9/_-]+\/read$/.test(scope) ||
    scope === "openid" ||
    scope === "https://uri.paypal.com/services/applications/webhooks"
  );
}

/** Refuses a token that cannot search transactions, or that can do anything beyond reading. */
export function requireReadOnly(scopes: string[]) {
  if (!scopes.includes(SEARCH_SCOPE))
    throw new VerificationError(
      "The PayPal app cannot search transactions. Turn on Transaction search in the app's features. PayPal can take up to nine hours to apply a change to an existing app, so a new app is quicker.",
    );
  const beyond = scopes.filter((scope) => !readsOnly(scope));
  if (beyond.length) {
    // Scope names only, to see which features founders' apps hold; never the credentials.
    console.warn("A PayPal app was refused for these scopes:", beyond.join(" "));
    throw new VerificationError(
      "The PayPal app can do more than search transactions. Create an app with only Transaction search turned on, and paste its Client ID and secret.",
    );
  }
}

/**
 * A token for the app. This is the one POST sent to PayPal: it issues a token from the app's
 * credentials and changes nothing in the account. A 401 means the credentials are not those of an
 * app in this environment.
 */
export async function fetchToken({ clientId, secret }: PayPalCredentials, livemode: boolean) {
  let response: Response;
  try {
    response = await fetch(`${base(livemode)}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderRequestError("PayPal could not be reached. Try again shortly.");
  }
  const body = await errorBody(response);
  if (response.status === 401)
    throw new ProviderRequestError(
      "PayPal refused the Client ID and secret. Check that both belong to the same app, created under Live.",
      401,
    );
  if (response.status === 429)
    throw new ProviderRequestError("PayPal is rate limiting requests. Try again later.", 429);
  if (!response.ok || typeof body?.access_token !== "string")
    throw new ProviderRequestError("PayPal did not issue access for the app. Try again shortly.");
  const scopes = typeof body.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [];
  return { token: body.access_token, scopes };
}

const PATH = "/v1/reporting/transactions";

type SearchPage = {
  transaction_details?: { transaction_info?: PayPalTransaction }[];
  total_pages?: number;
};

async function search(token: string, livemode: boolean, params: URLSearchParams) {
  const url = new URL(`${base(livemode)}${PATH}`);
  url.search = params.toString();
  const response = await providerGet("paypal", "PayPal", url, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  });
  if (response.ok) return (await response.json()) as SearchPage;
  const body = await errorBody(response);
  const issues = Array.isArray(body?.details)
    ? (body.details as { issue?: unknown }[]).map((detail) => detail?.issue)
    : [];
  if (response.status === 401)
    throw new ProviderRequestError("PayPal refused the app's access. Try again shortly.", 401);
  if (response.status === 403)
    throw new ProviderRequestError(
      "The PayPal app cannot search transactions. Turn on Transaction search in the app's features.",
      403,
      PATH,
    );
  if (response.status === 429)
    throw new ProviderRequestError("PayPal is rate limiting requests. Try again later.", 429);
  if (issues.includes("RESULTSET_TOO_LARGE") || body?.name === "RESULTSET_TOO_LARGE")
    throw tooMuchData("PayPal", PATH);
  const message = typeof body?.message === "string" ? body.message.slice(0, 300) : null;
  throw new ProviderRequestError(`PayPal returned an error${message ? `: ${message}` : "."}`);
}

const DAY = 86_400;
/** PayPal searches at most 31 days at a time. */
const SLICE = 30 * DAY;

const time = (seconds: number) => new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

/** PayPal lists the transactions of the last three years; this is the first day it still does. */
export function searchStart(now: number) {
  const date = new Date(now * 1000);
  return Date.UTC(date.getUTCFullYear() - 3, date.getUTCMonth(), date.getUTCDate() + 1) / 1000;
}

/**
 * Transactions from `before` back to `since`, 30 days at a time, each page a request counted
 * against `maxPages`. Every slice is read whole: a read that runs out of requests returns the
 * slices it finished and the start of the oldest one, from which the window is complete.
 */
export async function fetchTransactions(
  token: string,
  livemode: boolean,
  {
    since,
    before,
    maxPages,
    type,
  }: { since: number; before: number; maxPages: number; type?: string },
): Promise<{ transactions: PayPalTransaction[]; complete: boolean; from?: number }> {
  let requests = 0;
  const transactions: PayPalTransaction[] = [];
  let end = before;
  while (end > since) {
    const start = Math.max(since, end - SLICE);
    const slice: PayPalTransaction[] = [];
    for (let page = 1; ; page++) {
      if (requests++ >= maxPages) return { transactions, complete: false, from: end };
      const params = new URLSearchParams({
        start_date: time(start),
        end_date: time(end - 1),
        fields: "transaction_info",
        page_size: "500",
        page: String(page),
      });
      if (type) params.set("transaction_type", type);
      const result = await search(token, livemode, params);
      for (const detail of result.transaction_details ?? [])
        if (detail.transaction_info?.transaction_id) slice.push(detail.transaction_info);
      if (page >= (result.total_pages ?? 0)) break;
    }
    transactions.push(...slice);
    end = start;
  }
  return { transactions, complete: true };
}

/** The payments of subscriptions from `since` to `now`, all of them or none. */
export async function fetchSubscriptionPayments(
  token: string,
  livemode: boolean,
  since: number,
  now: number,
) {
  const read = await fetchTransactions(token, livemode, {
    since,
    before: now,
    maxPages: MAX_PAGES,
    type: SUBSCRIPTION_PAYMENT,
  });
  if (!read.complete) throw tooMuchData("PayPal", PATH);
  return read.transactions;
}
