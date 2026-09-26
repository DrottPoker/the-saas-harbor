// Site statistics: what a page view sends and keeps, for Vercel Web Analytics and for our own
// statistics in the admin panel (/api/analytics, migration 20260926060000). Pure, so it is
// unit-tested.
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

/** What the browser sends for each page it shows: its address, and on a page load the referrer. */
export const beaconSchema = z.object({
  path: z.string().max(2000),
  referrer: z.string().max(2000).nullish(),
});
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

// The admin panel's periods, in UTC.

export const ANALYTICS_RANGES = {
  "24h": { label: "24 hours", bucket: "hour", count: 24 },
  "7d": { label: "7 days", bucket: "day", count: 7 },
  "30d": { label: "30 days", bucket: "day", count: 30 },
  "90d": { label: "90 days", bucket: "day", count: 90 },
  "12m": { label: "12 months", bucket: "month", count: 12 },
} as const;
export type AnalyticsRange = keyof typeof ANALYTICS_RANGES;
export type Bucket = (typeof ANALYTICS_RANGES)[AnalyticsRange]["bucket"];
export const DEFAULT_RANGE: AnalyticsRange = "30d";

export function analyticsRange(value: string | undefined): AnalyticsRange {
  return value && Object.hasOwn(ANALYTICS_RANGES, value)
    ? (value as AnalyticsRange)
    : DEFAULT_RANGE;
}

/** The period up to now: the last `count` whole buckets, the current one included. */
export function analyticsPeriod(range: AnalyticsRange, now = new Date()) {
  const { bucket, count } = ANALYTICS_RANGES[range];
  const from = new Date(now);
  from.setUTCMinutes(0, 0, 0);
  if (bucket === "hour") from.setUTCHours(from.getUTCHours() - (count - 1));
  else {
    from.setUTCHours(0);
    if (bucket === "day") from.setUTCDate(from.getUTCDate() - (count - 1));
    else from.setUTCFullYear(from.getUTCFullYear(), from.getUTCMonth() - (count - 1), 1);
  }
  return { from: from.toISOString(), to: now.toISOString(), bucket };
}

const whole = z.number().int().nonnegative();
const totals = { visitors: whole, visits: whole, page_views: whole };

const analyticsSchema = z.object({
  ...totals,
  previous: z.object(totals),
  live: whole,
  series: z.array(
    z.object({ start: z.iso.datetime({ offset: true }), visitors: whole, page_views: whole }),
  ),
  pages: z.array(z.object({ path: z.string(), visitors: whole, page_views: whole })),
  sources: z.array(z.object({ source: z.string().nullable(), visits: whole })),
  campaigns: z.array(z.object({ campaign: z.string(), visits: whole })),
  countries: z.array(z.object({ country: z.string().nullable(), visitors: whole })),
  devices: z.array(z.object({ device: z.enum(DEVICES), visitors: whole })),
  browsers: z.array(z.object({ browser: z.string(), visitors: whole })),
  systems: z.array(z.object({ os: z.string(), visitors: whole })),
});
export type Analytics = z.infer<typeof analyticsSchema>;

/** Reads public.admin_analytics(); anything malformed is an error, never a wrong figure. */
export function parseAnalytics(value: unknown): Analytics {
  return analyticsSchema.parse(value);
}

const formats = {
  hour: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  day: { month: "short", day: "numeric" },
  month: { month: "short", year: "numeric" },
} as const satisfies Record<Bucket, Intl.DateTimeFormatOptions>;

/** "14:00", "Sep 26" or "Sep 2026", in UTC. */
export function bucketLabel(start: string, bucket: Bucket) {
  return new Intl.DateTimeFormat("en-US", { ...formats[bucket], timeZone: "UTC" }).format(
    new Date(start),
  );
}

const titles = {
  hour: { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  day: { weekday: "short", month: "short", day: "numeric", year: "numeric" },
  month: { month: "long", year: "numeric" },
} as const satisfies Record<Bucket, Intl.DateTimeFormatOptions>;

/** "Sep 26, 14:00 UTC", "Sat, Sep 26, 2026" or "September 2026". */
export function bucketTitle(start: string, bucket: Bucket) {
  const text = new Intl.DateTimeFormat("en-US", { ...titles[bucket], timeZone: "UTC" }).format(
    new Date(start),
  );
  return bucket === "hour" ? `${text} UTC` : text;
}

/** The change from the previous period in percent, or null when there is nothing to compare. */
export function percentChange(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

const regions = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string | null) {
  if (!code) return "Unknown";
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}

export const deviceLabels: Record<Device, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
  other: "Other",
};
