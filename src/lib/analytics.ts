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

const pageTime = z.object({
  // A random key the page gave its page view, which only that page knows.
  key: z.uuid(),
  ms: z.number().int().min(0).max(86_400_000),
});

/** What the user agent no longer tells: client hints from Chromium browsers, and iPads as Macs. */
const systemSchema = z.object({
  platform: z.string().max(40).optional(),
  version: z.string().max(40).optional(),
  ipad: z.boolean().optional(),
});
export type SystemHints = z.infer<typeof systemSchema>;

/**
 * What the browser sends: each page it shows, with its key, the tab's referrer, the tab's first
 * address (for a page that starts a new visit without a page load), the time of the page before and
 * the system hints; how long a page was visible, by its key; and clicks on links to other sites. A
 * beacon without a type is a page view, as the first version of the script sent them.
 */
export const beaconSchema = z.preprocess(
  (value) =>
    value && typeof value === "object" && !("type" in value)
      ? { ...value, type: "pageview" }
      : value,
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("pageview"),
      key: z.uuid().optional(),
      path: z.string().max(2000),
      referrer: z.string().max(2000).nullish(),
      landing: z.string().max(2000).nullish(),
      previous: pageTime.optional(),
      system: systemSchema.optional(),
    }),
    pageTime.extend({ type: z.literal("engagement") }),
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

const ANDROID_PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/**
 * Where a visit came from: another site's host without www, or android-app:<package> for a link
 * opened from an Android app, which gives android-app://<package>/ as the referrer. The reports
 * name known apps by their site (private.analytics_referrer_site). Null for none and for this site.
 */
export function referrerHost(referrer: string | null | undefined, siteHost: string) {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol === "android-app:") {
    const app = url.hostname.toLowerCase();
    return ANDROID_PACKAGE.test(app) && app.length <= 241 ? `android-app:${app}` : null;
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

// Apps that open links in a browser of their own, by what they add to the user agent.
const IN_APP: [RegExp, string][] = [
  [/\bGSA\//, "Google app"],
  [/\bFBAN\/|\bFBAV\/|\bFB_IAB\//, "Facebook app"],
  [/\bInstagram\b/, "Instagram app"],
  [/\bTwitter for iPhone\b|\bTwitterAndroid\b/, "X app"],
  [/\bLinkedInApp\b/, "LinkedIn app"],
  [/\bReddit\//, "Reddit app"],
  [/\bmusical_ly\b|\bBytedanceWebview\b/, "TikTok app"],
  [/\bSnapchat\b/, "Snapchat app"],
];

/** The in-app browser a user agent belongs to, or null for a browser of its own. */
function inAppBrowser(agent: string, parsedName: string | undefined) {
  const app = IN_APP.find(([pattern]) => pattern.test(agent))?.[1];
  if (app) return app;
  // ua-parser's names for an app's web view without a mark of its own.
  if (parsedName === "WebKit") return "iOS in-app browser";
  if (parsedName === "Chrome WebView") return "Android in-app browser";
  return null;
}

/** The parts of Next.js's userAgent() that the statistics read. */
export type ParsedAgent = {
  browser: { name?: string; version?: string };
  os: { name?: string; version?: string };
  device: { type?: string };
};

/** The system version that client hints give for the system the user agent names. */
function hintedVersion(os: string, hints: SystemHints | undefined) {
  const major = hints?.version?.match(/^(\d{1,4})(?:\.|$)/)?.[1];
  if (!major) return undefined;
  const platform = hints?.platform;
  // Windows 11 reports 13 or higher; 1 to 12 are Windows 10, 0 is older, which the user agent tells.
  if (os === "Windows" && platform === "Windows") {
    const n = Number(major);
    return n >= 13 ? "11" : n >= 1 ? "10" : undefined;
  }
  if ((os === "macOS" && platform === "macOS") || (os === "Android" && platform === "Android"))
    return String(Number(major));
  // ChromeOS reports a build number and Linux its kernel; neither is the version people know.
  return undefined;
}

/**
 * Device, browser and system with their major versions, from the user agent, what ua-parser made
 * of it, and the hints the browser sent. Browsers freeze parts of the user agent, so a version
 * that could belong to many is left unknown unless a hint tells it:
 * - Chrome and Samsung Internet on Android say Android 10 (and model K) on every device.
 * - Windows 11 says Windows NT 10.0, like Windows 10.
 * - Every browser on a Mac says macOS 10.15, whatever the version.
 * - Since iOS 26, Safari and web views say iOS 18.6 (or 18.7). Safari comes with the system, so
 *   its own version is the system's.
 * An iPad presents itself as a Mac unless its touch screen gives it away. In-app browsers get the
 * app's name and no version.
 */
export function technology(agent: string, parsed: ParsedAgent, hints?: SystemHints) {
  let device = deviceType(parsed.device.type);
  let os = systemName(parsed.os.name);
  let osVersion = majorVersion(parsed.os.version);
  const app = inAppBrowser(agent, parsed.browser.name);
  const browser = app ?? browserName(parsed.browser.name);
  const browserVersion = app ? null : majorVersion(parsed.browser.version);

  const ipad = hints?.ipad === true && os === "macOS";
  if (ipad) {
    device = "tablet";
    os = "iOS";
  }
  if (os === "Android" && /\bAndroid 10; K\)/.test(agent)) osVersion = null;
  if (os === "Windows" && /\bWindows NT 10\.0\b/.test(agent)) osVersion = null;
  if (/\bMac OS X 10[._]15(?!\d)/.test(agent)) osVersion = null;
  if (os === "iOS") {
    if (browser === "Safari") osVersion = browserVersion;
    else if (/\bOS 18_[67](?!\d)/.test(agent)) osVersion = null;
  }
  if (os === "ChromeOS") osVersion = browser === "Chrome" ? browserVersion : null;
  osVersion = hintedVersion(os, hints) ?? osVersion;
  return { device, browser, browserVersion, os, osVersion };
}
