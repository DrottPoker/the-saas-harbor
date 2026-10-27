import "server-only";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  tooMuchData,
} from "../http";
import { dayOf } from "../payments";
import type { AsaasPayment, AsaasSubscription } from "./mrr";

// Asaas has one address for production and one for the Sandbox, and a key works in its own only.
const ORIGINS = { live: "https://api.asaas.com", sandbox: "https://api-sandbox.asaas.com" };
// Asaas asks every request to name the application that sends it.
const USER_AGENT = "TheSaaSHarbor";

function base(livemode: boolean) {
  const override = process.env.ASAAS_API_BASE;
  if (override) return `${apiBase(override, "", "Asaas")}/${livemode ? "live" : "sandbox"}`;
  return livemode ? ORIGINS.live : ORIGINS.sandbox;
}

/** Asaas answered that the key belongs to its other environment. */
export class WrongEnvironment extends ProviderRequestError {}

type AsaasErrors = { code: string | null; description: string | null };

async function errorsOf(response: Response): Promise<AsaasErrors> {
  const body = await errorBody(response);
  const errors = Array.isArray(body?.errors) ? (body.errors as Record<string, unknown>[]) : [];
  const code = errors.map((error) => error?.code).find((value) => typeof value === "string");
  const description = errors
    .map((error) => error?.description)
    .find((value) => typeof value === "string");
  return {
    code: (code as string | undefined) ?? null,
    description: (description as string | undefined)?.slice(0, 300) ?? null,
  };
}

function failure(status: number, path: string, { code, description }: AsaasErrors): never {
  if (status === 401 && code === "invalid_environment")
    throw new WrongEnvironment(
      "The key belongs to the other Asaas environment. Production keys start with $aact_prod_.",
      401,
    );
  if (status === 401)
    throw new ProviderRequestError(
      "Asaas rejected the key. It may have been deleted or expired, or disabled after three months without use.",
      401,
    );
  if (status === 403 && code === "insufficient_permission")
    throw new ProviderRequestError(
      `The key cannot read everything verification needs. Give it Read access to Subscriptions and Charges.${description ? ` Asaas says: ${description}` : ""}`,
      403,
      path,
    );
  if (status === 403)
    throw new ProviderRequestError(
      "Asaas refused the request. A key limited to certain IP addresses cannot be verified.",
      403,
      path,
    );
  if (status === 429)
    throw new ProviderRequestError(
      "Asaas is limiting requests, or the account has used its requests for the last 12 hours. Try again later.",
      429,
    );
  throw new ProviderRequestError(
    `Asaas returned an error${description ? `: ${description}` : "."}`,
    status,
    path,
  );
}

function send(key: string, livemode: boolean, path: string, params: URLSearchParams) {
  const url = new URL(`${base(livemode)}${path}`);
  url.search = params.toString();
  return providerGet("asaas", "Asaas", url, {
    access_token: key,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  });
}

async function asaasGet<T>(key: string, livemode: boolean, path: string, params: URLSearchParams) {
  const response = await send(key, livemode, path, params);
  if (response.ok) return (await response.json()) as T;
  return failure(response.status, path, await errorsOf(response));
}

/**
 * Whether the key can read `path`: true when Asaas answers it, false when it refuses the key the
 * permission, which is what a key limited to subscriptions and charges should get outside them.
 */
export async function canRead(
  key: string,
  livemode: boolean,
  path: string,
  params: URLSearchParams,
) {
  const response = await send(key, livemode, path, params);
  if (response.ok) return true;
  const errors = await errorsOf(response);
  if (response.status === 403 && errors.code === "insufficient_permission") return false;
  return failure(response.status, path, errors);
}

/**
 * Reads outside subscriptions and charges that a key created without permissions can make, since
 * Asaas gives such a key full access: transfers (TRANSFER) and customers (CUSTOMER). The filters
 * match nothing, so no transfer or customer is read.
 */
export function otherAccessReads(): [string, URLSearchParams][] {
  return [
    ["/v3/transfers", new URLSearchParams({ "dateCreated[ge]": "2999-01-01", limit: "1" })],
    [
      "/v3/customers",
      new URLSearchParams({ externalReference: "the-saas-harbor-access-check", limit: "1" }),
    ],
  ];
}

type Page<T> = { data?: T[] | null; hasMore?: boolean; totalCount?: number | null };

/** Lists are pages of at most 100 by offset, and say whether there are more. */
export const PAGE_SIZE = 100;

function page<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: [string, string][],
  offset: number,
) {
  const query = new URLSearchParams([
    ...params,
    ["offset", String(offset)],
    ["limit", String(PAGE_SIZE)],
  ]);
  return asaasGet<Page<T>>(key, livemode, path, query);
}

/**
 * Reads a whole list, from its first page where that was read already. `complete` is false when it
 * goes on beyond `maxPages` requests; `requests` counts those sent.
 */
async function listPages<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: [string, string][],
  maxPages: number,
  first?: Page<T>,
) {
  const items: T[] = [];
  let requests = 0;
  for (let index = 0; ; index++) {
    let result = index === 0 ? first : undefined;
    if (!result) {
      if (requests >= maxPages) return { items, complete: false, requests };
      result = await page<T>(key, livemode, path, params, index * PAGE_SIZE);
      requests++;
    }
    const data = result.data ?? [];
    items.push(...data);
    if (!result.hasMore || !data.length) return { items, complete: true, requests };
  }
}

async function listAll<T>(
  key: string,
  livemode: boolean,
  path: string,
  params: [string, string][],
) {
  const { items, complete } = await listPages<T>(key, livemode, path, params, MAX_PAGES);
  if (!complete) throw tooMuchData("Asaas", path);
  return items;
}

/** Active subscriptions. Permission: SUBSCRIPTION:READ. */
export function fetchActiveSubscriptions(key: string, livemode: boolean) {
  return listAll<AsaasSubscription>(key, livemode, "/v3/subscriptions", [["status", "ACTIVE"]]);
}

/**
 * Every subscription, ended and removed ones included, for the cycles of their charges.
 * Permission: SUBSCRIPTION:READ.
 */
export function fetchAllSubscriptions(key: string, livemode: boolean) {
  return listAll<AsaasSubscription>(key, livemode, "/v3/subscriptions", [
    ["includeDeleted", "true"],
  ]);
}

/**
 * Charges in any status due from `from` up to `to` (YYYY-MM-DD, both included; `to` null for no
 * end). Permission: PAYMENT:READ.
 */
export function fetchChargesDue(key: string, livemode: boolean, from: string, to: string | null) {
  const params: [string, string][] = [["dueDate[ge]", from]];
  if (to) params.push(["dueDate[le]", to]);
  return listAll<AsaasPayment>(key, livemode, "/v3/payments", params);
}

const DAY = 86_400;
/** The days of one slice of a window too large to read whole in one go. */
const SLICE_DAYS = 31;

/**
 * Charges paid in a window (Unix seconds at the start of a day, `before` exclusive), in any status,
 * each page a request counted against `maxPages`. Asaas does not document the order of its lists,
 * so only ranges read whole count: the whole window when its first page counts no more charges
 * than the pages allowed hold, or else 31 days at a time from its end, each slice read whole. A
 * read that runs out of pages returns the slices it finished and the start of the oldest one, from
 * which the window is complete, and the next read goes on from there. Permission: PAYMENT:READ.
 */
export async function fetchPaidWindow(
  key: string,
  livemode: boolean,
  since: number,
  before: number,
  maxPages: number,
): Promise<{ payments: AsaasPayment[]; complete: boolean; from?: number }> {
  const path = "/v3/payments";
  const params = (from: number, to: number): [string, string][] => [
    ["paymentDate[ge]", dayOf(from)],
    ["paymentDate[le]", dayOf(to - DAY)],
  ];
  if (maxPages < 1 || before <= since) return { payments: [], complete: before <= since };
  const first = await page<AsaasPayment>(key, livemode, path, params(since, before), 0);
  const total = typeof first.totalCount === "number" ? first.totalCount : Infinity;
  if (!first.hasMore || Math.ceil(total / PAGE_SIZE) <= maxPages) {
    const whole = await listPages(key, livemode, path, params(since, before), maxPages - 1, first);
    if (whole.complete) return { payments: whole.items, complete: true };
    return { payments: [], complete: false, from: before };
  }
  const payments: AsaasPayment[] = [];
  let left = maxPages - 1;
  let end = before;
  while (end > since) {
    const start = Math.max(since, end - SLICE_DAYS * DAY);
    const slice = await listPages<AsaasPayment>(key, livemode, path, params(start, end), left);
    left -= slice.requests;
    if (!slice.complete) return { payments, complete: false, from: end };
    payments.push(...slice.items);
    end = start;
  }
  return { payments, complete: true };
}
