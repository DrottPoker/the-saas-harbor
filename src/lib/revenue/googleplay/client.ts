import "server-only";
import { VerificationError } from "../errors";
import {
  apiBase,
  errorBody,
  MAX_PAGES,
  providerGet,
  ProviderRequestError,
  rateLimited,
  returnedError,
  tooMuchData,
  unreachable,
} from "../http";
import { signedAssertion, type ServiceAccount } from "./key";
import { reportMonth } from "./report";

const NAME = "Google Play";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STORAGE_ORIGIN = "https://storage.googleapis.com";

/** The only scope asked for: reading Cloud Storage, whatever else the service account may do. */
export const READ_ONLY_SCOPE = "https://www.googleapis.com/auth/devstorage.read_only";

/** Google's addresses, or the browser tests' fake server for both. */
function endpoints() {
  const override = process.env.GOOGLE_PLAY_API_BASE;
  if (!override) return { token: TOKEN_URL, storage: STORAGE_ORIGIN };
  const base = apiBase(override, "", NAME);
  return { token: `${base}/token`, storage: base };
}

/**
 * Refuses a token whose scopes go beyond reading Cloud Storage. Google gives the scopes it granted
 * where it says; a token granted without saying holds the one scope asked for.
 */
export function requireReadOnly(scope: unknown) {
  if (scope === undefined || scope === null) return;
  const scopes = typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [];
  if (!scopes.length || scopes.some((granted) => granted !== READ_ONLY_SCOPE))
    throw new VerificationError("googleplay.beyondReadOnly");
}

/**
 * A token that can only read Cloud Storage. This is the one POST sent to Google: it exchanges a
 * JWT signed with the service account's key for a token and changes nothing in any account.
 */
export async function fetchToken(account: ServiceAccount) {
  const assertion = signedAssertion(
    account,
    READ_ONLY_SCOPE,
    TOKEN_URL,
    Math.floor(Date.now() / 1000),
  );
  let response: Response;
  try {
    response = await fetch(endpoints().token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw unreachable(NAME);
  }
  const body = await errorBody(response);
  const error = typeof body?.error === "string" ? body.error : null;
  const description = typeof body?.error_description === "string" ? body.error_description : "";
  if (response.status === 429) throw rateLimited("Google");
  if (
    (error === "invalid_grant" && /signature|account not found/i.test(description)) ||
    error === "invalid_client" ||
    error === "disabled_client" ||
    error === "deleted_client" ||
    error === "unauthorized_client"
  )
    throw new ProviderRequestError("googleplay.keyRefused", {}, { status: response.status });
  if (!response.ok || typeof body?.access_token !== "string")
    throw new ProviderRequestError("googleplay.noAccess", {}, { status: response.status });
  requireReadOnly(body.scope);
  return body.access_token;
}

/** A Cloud Storage failure in words for the founder. */
async function failure(response: Response, path: string): Promise<never> {
  const body = await errorBody(response);
  const error = (body?.error ?? null) as {
    message?: unknown;
    errors?: { reason?: unknown }[];
  } | null;
  const message = typeof error?.message === "string" ? error.message : "";
  const reasons = (error?.errors ?? []).map((item) => item?.reason);
  if (response.status === 401)
    throw new ProviderRequestError("googleplay.tokenRefused", {}, { status: 401 });
  if (
    response.status === 403 &&
    (reasons.includes("accessNotConfigured") || /has not been used|is disabled/i.test(message))
  )
    throw new ProviderRequestError("googleplay.apiDisabled", {}, { status: 403, path });
  if (response.status === 403)
    throw new ProviderRequestError("googleplay.cannotReadReports", {}, { status: 403, path });
  if (response.status === 404)
    throw new ProviderRequestError("googleplay.noBucket", {}, { status: 404, path });
  if (response.status === 429) throw rateLimited("Google");
  throw returnedError("Google Cloud Storage", message.slice(0, 300));
}

const bucketPath = (bucket: string) => `/storage/v1/b/${encodeURIComponent(bucket)}/o`;

/** A monthly sales report in the bucket. */
export type ReportFile = { name: string; month: string; size: number };

/** The monthly estimated sales reports in the bucket (permission: View financial data). */
export async function listSalesReports(token: string, bucket: string) {
  const path = bucketPath(bucket);
  const files: ReportFile[] = [];
  let pageToken: string | null = null;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) throw tooMuchData(NAME, path);
    const url = new URL(`${endpoints().storage}${path}`);
    url.searchParams.set("prefix", "sales/salesreport_");
    url.searchParams.set("fields", "items(name,size),nextPageToken");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await providerGet("googleplay", NAME, url, {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    });
    if (!response.ok) return failure(response, path);
    const body = (await response.json()) as {
      items?: { name?: string; size?: string | number }[];
      nextPageToken?: string;
    };
    for (const item of body.items ?? []) {
      const month = item.name ? reportMonth(item.name) : null;
      const size = Number(item.size);
      if (month && Number.isFinite(size)) files.push({ name: item.name!, month, size });
    }
    if (!body.nextPageToken) return files;
    pageToken = body.nextPageToken;
  }
}

/** One report file's bytes. */
export async function downloadReport(token: string, bucket: string, file: ReportFile) {
  const path = `${bucketPath(bucket)}/${encodeURIComponent(file.name)}`;
  const url = new URL(`${endpoints().storage}${path}`);
  url.searchParams.set("alt", "media");
  const response = await providerGet("googleplay", NAME, url, {
    Authorization: `Bearer ${token}`,
  });
  if (!response.ok) return failure(response, path);
  try {
    return Buffer.from(await response.arrayBuffer());
  } catch {
    throw unreachable(NAME);
  }
}
