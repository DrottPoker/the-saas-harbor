// Site statistics: what the browser sends and the server keeps, for Vercel Web Analytics and for
// our own statistics in the admin panel (/api/analytics, migrations 20260926060000 and
// 20260926070000). The reports are in analytics-reports.ts. Pure, so it is unit-tested.
import { z } from "zod";

// Only campaign tags stay in an address; other query values can carry tokens or search terms.
const KEPT_PARAMS = /^utm_(source|medium|campaign|term|content)$/;

/** Admin pages are never measured. */
export function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

/**
 * What Vercel Web Analytics receives for an event: nothing for admin pages, and otherwise the
 * address with only its campaign tags and no fragment.
 */
export function vercelEvent<T extends { url: string }>(event: T): T | null {
  const url = new URL(event.url);
  if (isAdminPath(url.pathname)) return null;
  for (const name of [...url.searchParams.keys()])
    if (!KEPT_PARAMS.test(name)) url.searchParams.delete(name);
  url.hash = "";
  return { ...event, url: url.toString() };
}

// Our own statistics.

/**
 * What the browser sends: each page it shows, with the referrer on a page load; how long a page
 * was visible, by the id its page view got; and clicks on links to other sites. A beacon without a
 * type is a page view, as the first version of the script sent them.
 */
export const beaconSchema = z.preprocess(
  (value) =>
    value && typeof value === "object" && !("type" in value)
      ? { ...value, type: "pageview" }
      : value,
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("pageview"),
      path: z.string().max(2000),
      referrer: z.string().max(2000).nullish(),
    }),
    z.object({
      type: z.literal("engagement"),
      id: z.number().int().positive(),
      ms: z.number().int().min(0).max(86_400_000),
    }),
    z.object({
      type: z.literal("outbound"),
      path: z.string().max(2000),
      url: z.string().max(2000),
    }),
  ]),
);
export type Beacon = z.infer<typeof beaconSchema>;
export const BEACON_MAX_BYTES = 4096;

// Crawlers, link previews, monitors, scripts and headless browsers, on top of Next.js's own list.
const AUTOMATED =
  /bot|crawl|spider|slurp|scrape|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|curl|wget|python|httpclient|axios|node-fetch|undici|go-http|java\/|okhttp|phantom|selenium|puppeteer|playwright/i;

export function isAutomated(userAgent: string | null | undefined) {
  return !userAgent || AUTOMATED.test(userAgent);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PATH = 300;
const MAX_TAG = 100;

function tag(value: string | null) {
  const trimmed = value?.trim().slice(0, MAX_TAG);
  return trimmed || null;
}

/**
 * The page a view is recorded for, from the path and query the browser sent: the path alone,
 * with ids replaced by [id] so private addresses keep nothing that points at a person, and the
 * campaign tags. Null for admin pages and anything that is not a path on this site.
 */
export function pageView(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  let url: URL;
  try {
    url = new URL(value, "http://site.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://site.invalid" || isAdminPath(url.pathname)) return null;
  const segments = url.pathname.split("/").map((part) => (UUID.test(part) ? "[id]" : part));
  const path = segments.join("/").replace(/(.)\/+$/, "$1");
  if (path.length > MAX_PATH) return null;
  return {
    path,
    utmSource: tag(url.searchParams.get("utm_source")),
    utmMedium: tag(url.searchParams.get("utm_medium")),
    utmCampaign: tag(url.searchParams.get("utm_campaign")),
    utmTerm: tag(url.searchParams.get("utm_term")),
    utmContent: tag(url.searchParams.get("utm_content")),
  };
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** The site a visit came from, as a host without www, or null for none and for this site. */
export function referrerHost(referrer: string | null | undefined, siteHost: string) {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = bareHost(url.hostname);
  if (!host || host === bareHost(siteHost.replace(/:\d+$/, ""))) return null;
  return host.slice(0, 253);
}

/**
 * A link to another site that was clicked: its address without query or fragment (the site alone
 * when that is too long), and its host without www. Null for this site and anything not http(s).
 */
export function outboundTarget(value: string, siteHost: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = bareHost(url.hostname);
  if (!host || host === bareHost(siteHost.replace(/:\d+$/, ""))) return null;
  let target = `${url.protocol}//${url.host}${url.pathname}`;
  if (target.length > MAX_PATH) target = `${url.protocol}//${url.host}/`;
  if (target.length > MAX_PATH) return null;
  return { target, host: host.slice(0, 253) };
}

/** The visitor's language from Accept-Language: the first one, as a two- or three-letter code. */
export function languageCode(value: string | null) {
  const code = value?.split(",")[0]?.split(";")[0]?.split("-")[0]?.trim().toLowerCase();
  return code && /^[a-z]{2,3}$/.test(code) ? code : null;
}

/** The city from the host's geolocation header, which is URL-encoded. */
export function cityName(value: string | null) {
  if (!value) return null;
  try {
    const city = decodeURIComponent(value).trim();
    return city && city.length <= 100 ? city : null;
  } catch {
    return null;
  }
}

/** The major version of a browser or system, such as 140 for Chrome 140.0.7339.80. */
export function majorVersion(value: string | undefined) {
  return value?.match(/^(\d{1,4})(?:\D|$)/)?.[1] ?? null;
}

/** A two-letter country code from the host's geolocation header, or null. */
export function countryCode(value: string | null) {
  return value && /^[A-Z]{2}$/.test(value) && value !== "XX" ? value : null;
}

/** The client's address as the host reports it; only hashed, never stored. */
export function clientAddress(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || ""
  );
}

export const DEVICES = ["desktop", "mobile", "tablet", "other"] as const;
export type Device = (typeof DEVICES)[number];

/** A device from ua-parser's type, which is undefined for desktop browsers. */
export function deviceType(type: string | undefined): Device {
  if (!type) return "desktop";
  return type === "mobile" || type === "tablet" ? type : "other";
}

// ua-parser names, grouped into the few that matter.
const BROWSERS: [RegExp, string][] = [
  [/edge/i, "Edge"],
  [/opera|opr/i, "Opera"],
  [/samsung/i, "Samsung Internet"],
  [/firefox/i, "Firefox"],
  [/safari/i, "Safari"],
  [/chrom/i, "Chrome"],
  [/brave/i, "Brave"],
];
const SYSTEMS: [RegExp, string][] = [
  [/^windows/i, "Windows"],
  [/^mac ?os/i, "macOS"],
  [/^ios|^ipados/i, "iOS"],
  [/^android/i, "Android"],
  [/^chrom(e|ium) ?os/i, "ChromeOS"],
  [/linux|ubuntu|debian|fedora|arch|mint|centos|red ?hat|suse/i, "Linux"],
];

function named(value: string | undefined, names: [RegExp, string][]) {
  return names.find(([pattern]) => value && pattern.test(value))?.[1] ?? "Other";
}
export const browserName = (value: string | undefined) => named(value, BROWSERS);
export const systemName = (value: string | undefined) => named(value, SYSTEMS);
