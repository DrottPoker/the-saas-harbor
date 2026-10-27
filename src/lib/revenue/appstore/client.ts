import "server-only";
import { gunzipSync } from "node:zlib";
import { apiBase, errorBody, providerGet, ProviderRequestError, tooMuchData } from "../http";
import { appStoreToken, type AppStoreCredentials } from "./key";
import { parseReport, type ReportRow } from "./mrr";

// The App Store Connect API. It has no test environment for reports.
const ORIGIN = "https://api.appstoreconnect.apple.com";
const NAME = "App Store Connect";

function base() {
  return apiBase(process.env.APPSTORE_API_BASE, ORIGIN, "App Store");
}

export const REPORTS = "/v1/salesReports";

/** Each report's current version, as Apple's table of allowed values gives it. */
const VERSIONS = { SALES: "1_0", SUBSCRIPTION: "1_3" };
export type ReportType = keyof typeof VERSIONS;

/** Query parameters that Apple leaves out when it checks a token's scope. */
const UNSCOPED = new Set(["limit", "cursor", "sort"]);

/** What a token is scoped to: the request's method, path and query, as Apple matches them. */
export function scopeOf(path: string, query: string) {
  const scoped = query
    .split("&")
    .filter((pair) => pair && !UNSCOPED.has(pair.split("=")[0]))
    .join("&");
  return `GET ${path}${scoped ? `?${scoped}` : ""}`;
}

/**
 * The query of a daily report. Brackets stay as they are, in the address and in the token's
 * scope alike; every value is letters, digits, dashes and underscores.
 */
export function reportQuery(vendor: string, report: ReportType, date: string) {
  return [
    ["filter[frequency]", "DAILY"],
    ["filter[reportDate]", date],
    ["filter[reportSubType]", "SUMMARY"],
    ["filter[reportType]", report],
    ["filter[vendorNumber]", vendor],
    ["filter[version]", VERSIONS[report]],
  ]
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

async function send(credentials: AppStoreCredentials, path: string, query: string, accept: string) {
  const url = new URL(`${base()}${path}`);
  url.search = query;
  return providerGet("appstore", NAME, url, {
    Authorization: `Bearer ${appStoreToken(credentials, scopeOf(path, query))}`,
    Accept: accept,
  });
}

type AppleError = { code?: unknown; detail?: unknown; source?: { parameter?: unknown } | null };

async function appleErrors(response: Response) {
  const body = await errorBody(response);
  return Array.isArray(body?.errors) ? (body.errors as AppleError[]) : [];
}

const parameterOf = (errors: AppleError[]) =>
  errors.map((error) => error.source?.parameter).find((value) => typeof value === "string");

/** Apple does not take the vendor number for the key's team. */
export class UnknownVendorError extends ProviderRequestError {
  constructor(path: string) {
    super(
      "Apple does not recognize the vendor number for this key's team. Copy it from Payments and Financial Reports in App Store Connect.",
      400,
      path,
    );
  }
}

function failure(status: number, errors: AppleError[], path: string): never {
  const found = errors.map((error) => error.detail).find((value) => typeof value === "string");
  const detail = (found as string | undefined)?.slice(0, 300);
  if (status === 401)
    throw new ProviderRequestError(
      "Apple refused the key. Check that the Issuer ID, the Key ID and the private key belong to one active Team key. Individual keys cannot download sales reports.",
      401,
    );
  if (status === 403)
    throw new ProviderRequestError(
      path === REPORTS
        ? "The key cannot download sales reports. Create a Team key with the Sales role and access to reports, or with the Finance role."
        : `Apple did not let the key read ${path}.`,
      403,
      path,
    );
  if (status === 429)
    throw new ProviderRequestError("Apple is rate limiting requests. Try again later.", 429);
  if (status === 400 && parameterOf(errors) === "filter[vendorNumber]")
    throw new UnknownVendorError(path);
  throw new ProviderRequestError(`Apple returned an error${detail ? `: ${detail}` : "."}`, status);
}

/** Reports are small; this bounds what one unpacks to. */
const MAX_REPORT_BYTES = 64 * 1024 * 1024;

/** A report's text, from the gzip file Apple sends, or as it came when it is not packed. */
export function reportText(bytes: Buffer) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.toString("utf8");
  try {
    return gunzipSync(bytes, { maxOutputLength: MAX_REPORT_BYTES }).toString("utf8");
  } catch (error) {
    if ((error as { code?: unknown }).code === "ERR_BUFFER_TOO_LARGE")
      throw tooMuchData("App Store", REPORTS);
    throw new ProviderRequestError("Apple sent a report that could not be read.");
  }
}

/**
 * A daily report's rows, or null when Apple has none for the day: nothing was sold or active
 * that day, the report is not out yet, or the day is older than Apple keeps.
 */
export async function fetchDailyReport(
  credentials: AppStoreCredentials,
  report: ReportType,
  date: string,
): Promise<ReportRow[] | null> {
  const response = await send(
    credentials,
    REPORTS,
    reportQuery(credentials.vendor, report, date),
    "application/a-gzip, application/json",
  );
  if (response.ok) return parseReport(reportText(Buffer.from(await response.arrayBuffer())));
  const errors = await appleErrors(response);
  if (response.status === 404) return null;
  if (response.status === 400 && parameterOf(errors) === "filter[reportDate]") return null;
  return failure(response.status, errors, REPORTS);
}

/** Whether the key may read `path`: true when Apple answers, false when it forbids the key. */
async function canRead(credentials: AppStoreCredentials, path: string) {
  const response = await send(credentials, path, "limit=1", "application/json");
  if (response.ok) return true;
  const errors = await appleErrors(response);
  if (response.status === 403) return false;
  return failure(response.status, errors, path);
}

/** Certificates and profiles are for the Admin, App Manager and Developer roles. */
export function canReadCertificates(credentials: AppStoreCredentials) {
  return canRead(credentials, "/v1/certificates");
}

/**
 * Ratings and reviews are for every role that can change an app or answer customers: Admin, App
 * Manager, Developer, Marketing and Customer Support, but not Sales or Finance.
 */
export function canReadReviews(credentials: AppStoreCredentials, app: string) {
  return canRead(credentials, `/v1/apps/${encodeURIComponent(app)}/customerReviews`);
}

/** An app of the team, or null when the key may not list them. */
export async function fetchFirstApp(credentials: AppStoreCredentials) {
  const response = await send(credentials, "/v1/apps", "limit=1", "application/json");
  if (response.ok) {
    const body = (await response.json()) as { data?: { id?: unknown }[] };
    const id = body.data?.[0]?.id;
    return typeof id === "string" ? id : null;
  }
  const errors = await appleErrors(response);
  if (response.status === 403) return null;
  return failure(response.status, errors, "/v1/apps");
}
