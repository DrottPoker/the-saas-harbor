import "server-only";
import {
  apiBase,
  errorBody,
  providerGet,
  ProviderRequestError,
  rateLimited,
  returnedError,
  unreachable,
} from "../http";
import type { ChartData, ChartDefinitions } from "./mrr";

// Superwall's API v2, with organization API keys as bearer tokens. It has no environments: the
// charts are asked for production purchases.
const ORIGIN = "https://api.superwall.com";

function base() {
  return apiBase(process.env.SUPERWALL_API_BASE, ORIGIN, "Superwall");
}

const headers = (key: string) => ({ Authorization: `Bearer ${key}`, Accept: "application/json" });

async function failure(response: Response, path: string): Promise<never> {
  const body = await errorBody(response);
  const detail = typeof body?.message === "string" ? body.message.slice(0, 300) : null;
  if (response.status === 401)
    throw new ProviderRequestError("superwall.keyRejected", {}, { status: 401 });
  if (response.status === 403)
    throw new ProviderRequestError("superwall.cannotReadCharts", {}, { status: 403, path });
  if (response.status === 404)
    throw new ProviderRequestError("superwall.noApp", {}, { status: 404, path });
  if (response.status === 429) throw rateLimited("Superwall");
  throw returnedError("Superwall", detail, { status: response.status, path });
}

async function send(key: string, path: string, query: string) {
  const url = new URL(`${base()}${path}`);
  url.search = query;
  return providerGet("superwall", "Superwall", url, headers(key));
}

/** The app's charts with their axes. Scope: charts:read. */
export async function fetchDefinitions(key: string, application: string) {
  const path = "/v2/charts/definitions";
  const response = await send(
    key,
    path,
    new URLSearchParams({ application_id: application }).toString(),
  );
  if (response.ok) return (await response.json()) as ChartDefinitions;
  return failure(response, path);
}

/**
 * Whether the key can read `path`: true when Superwall answers it and false when it refuses the
 * key, which is what a key with charts:read alone should get outside charts.
 */
export async function canRead(key: string, { path, query }: { path: string; query: string }) {
  const response = await send(key, path, query);
  if (response.ok) return true;
  if (response.status === 403 || response.status === 404) return false;
  return failure(response, path);
}

/**
 * Lists outside charts, each needing a scope of its own: the organization's projects
 * (projects:read), and the app's paywalls (paywalls:read) and campaigns (campaigns:read).
 */
export function otherAccess(application: string) {
  const app = new URLSearchParams({ application_id: application, limit: "1" }).toString();
  return [
    { path: "/v2/projects", query: "limit=1" },
    { path: "/v2/paywalls", query: app },
    { path: "/v2/campaigns", query: app },
  ];
}

/**
 * A chart's values. This POST is the one request to Superwall that is not a GET (the owner's
 * approval of 2026-10-27): it only reads chart data, with the query in its body. It is not spaced
 * like GET requests, and a run sends a handful.
 */
export async function fetchChart(key: string, query: Record<string, unknown>) {
  const path = "/v2/charts/data";
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, {
      method: "POST",
      headers: { ...headers(key), "Content-Type": "application/json" },
      body: JSON.stringify(query),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw unreachable("Superwall");
  }
  if (response.ok) return (await response.json()) as ChartData;
  return failure(response, path);
}
