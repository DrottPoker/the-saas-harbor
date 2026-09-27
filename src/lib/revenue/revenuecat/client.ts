import "server-only";
import { apiBase, errorBody, providerGet, ProviderRequestError } from "../http";
import type { ChartData, ChartOptions } from "./mrr";

// RevenueCat's API v2. It has no environments: charts count production purchases.
const ORIGIN = "https://api.revenuecat.com/v2";

function base() {
  return apiBase(process.env.REVENUECAT_API_BASE, ORIGIN, "RevenueCat");
}

async function send(key: string, path: string, params: URLSearchParams) {
  const url = new URL(`${base()}${path}`);
  url.search = params.toString();
  return providerGet("revenuecat", "RevenueCat", url, {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  });
}

async function failure(response: Response, path: string): Promise<never> {
  const body = await errorBody(response);
  const detail = typeof body?.message === "string" ? body.message.slice(0, 300) : null;
  if (response.status === 401)
    throw new ProviderRequestError(
      "RevenueCat rejected the key. It may have been revoked, or be a V1 key rather than a V2 secret key.",
      401,
    );
  if (response.status === 403)
    throw new ProviderRequestError(
      "The key cannot read this project's charts. Check the project ID and give the key read access to Charts & metrics.",
      403,
      path,
    );
  if (response.status === 404)
    throw new ProviderRequestError("RevenueCat found no project with this ID.", 404, path);
  if (response.status === 423)
    throw new ProviderRequestError(
      "RevenueCat is still preparing this project's charts. Try again later.",
      423,
    );
  if (response.status === 429)
    throw new ProviderRequestError("RevenueCat is rate limiting requests. Try again later.", 429);
  throw new ProviderRequestError(`RevenueCat returned an error${detail ? `: ${detail}` : "."}`);
}

async function revenueCatGet<T>(key: string, path: string, params = new URLSearchParams()) {
  const response = await send(key, path, params);
  if (response.ok) return (await response.json()) as T;
  return failure(response, path);
}

const projectPath = (project: string) => `/projects/${encodeURIComponent(project)}`;

/**
 * Whether the key can read `path`: true when RevenueCat answers it and false when it refuses the
 * key access, which is what a key limited to charts should get outside them.
 */
export async function canRead(key: string, path: string) {
  const response = await send(key, path, new URLSearchParams({ limit: "1" }));
  if (response.ok) return true;
  if (response.status === 403) return false;
  return failure(response, path);
}

/** Paths outside Charts & metrics: the project list, and the project's customers. */
export function otherAccessPaths(project: string) {
  return ["/projects", `${projectPath(project)}/customers`];
}

/** Permission: charts_metrics:charts:read. */
export function fetchChartOptions(key: string, project: string, chart: string) {
  return revenueCatGet<ChartOptions>(key, `${projectPath(project)}/charts/${chart}/options`);
}

/** A chart's values between two dates (YYYY-MM-DD), in USD. */
export function fetchChart(
  key: string,
  project: string,
  chart: string,
  query: {
    resolution: string;
    start: string;
    end: string;
    selectors: Record<string, string> | null;
  },
) {
  const params = new URLSearchParams({
    resolution: query.resolution,
    start_date: query.start,
    end_date: query.end,
    currency: "USD",
  });
  if (query.selectors) params.set("selectors", JSON.stringify(query.selectors));
  return revenueCatGet<ChartData>(key, `${projectPath(project)}/charts/${chart}`, params);
}
