// The admin panel's Analytics reports: periods, what each report returns, and how figures read.
// The database computes them (public.admin_analytics_*, migration 20260926070000); the route
// /admin/analytics/data validates them here. Pure, so it is unit-tested.
import { z } from "zod";

export const RANGES = [
  { value: "24h", short: "24h", label: "Last 24 hours" },
  { value: "7d", short: "7d", label: "Last 7 days" },
  { value: "30d", short: "30d", label: "Last 30 days" },
  { value: "12m", short: "12m", label: "Last 12 months" },
  { value: "all", short: "All", label: "All time" },
] as const;
export type Range = (typeof RANGES)[number]["value"];
export const RANGE_VALUES = RANGES.map((range) => range.value) as [Range, ...Range[]];
export const DEFAULT_RANGE: Range = "30d";

export function rangeLabel(range: Range) {
  return RANGES.find((option) => option.value === range)!.label;
}

/** The period before, as the change beside a figure names it. */
export function previousLabel(range: Range) {
  return {
    "24h": "the 24 hours before",
    "7d": "the 7 days before",
    "30d": "the 30 days before",
    "12m": "the 12 months before",
    all: "",
  }[range];
}

// Breakdowns. Page-kind rows count page views, visit-kind rows count visits.
export const DIMENSIONS = {
  page: { label: "Page", kind: "page" },
  entry_page: { label: "Entry page", kind: "visit" },
  exit_page: { label: "Exit page", kind: "exit" },
  channel: { label: "Channel", kind: "visit" },
  source: { label: "Source", kind: "visit" },
  referrer: { label: "Referring site", kind: "visit" },
  utm_source: { label: "utm_source", kind: "visit" },
  utm_medium: { label: "utm_medium", kind: "visit" },
  utm_campaign: { label: "utm_campaign", kind: "visit" },
  utm_term: { label: "utm_term", kind: "visit" },
  utm_content: { label: "utm_content", kind: "visit" },
  country: { label: "Country", kind: "visit" },
  city: { label: "City", kind: "visit" },
  language: { label: "Language", kind: "visit" },
  device: { label: "Device", kind: "visit" },
  browser: { label: "Browser", kind: "visit" },
  browser_version: { label: "Browser version", kind: "visit" },
  os: { label: "Operating system", kind: "visit" },
  os_version: { label: "System version", kind: "visit" },
  outbound: { label: "Link", kind: "outbound" },
} as const;
export type Dimension = keyof typeof DIMENSIONS;
export const DIMENSION_VALUES = Object.keys(DIMENSIONS) as [Dimension, ...Dimension[]];

export const REPORTS = [
  "overview",
  "breakdown",
  "heatmap",
  "behavior",
  "live",
  "platform",
] as const;
export type Report = (typeof REPORTS)[number];

/** A time zone the runtime knows, such as Europe/Stockholm. */
export function isTimeZone(value: string) {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A request to /admin/analytics/data. */
export const reportRequestSchema = z.discriminatedUnion("report", [
  z.object({ report: z.literal("live") }),
  z.object({
    report: z.enum(["overview", "heatmap", "behavior", "platform"]),
    range: z.enum(RANGE_VALUES),
    tz: z.string().refine(isTimeZone),
  }),
  z.object({
    report: z.literal("breakdown"),
    range: z.enum(RANGE_VALUES),
    tz: z.string().refine(isTimeZone),
    dimension: z.enum(DIMENSION_VALUES),
    limit: z.coerce.number().int().min(1).max(100),
  }),
]);
export type ReportRequest = z.infer<typeof reportRequestSchema>;

export function reportUrl(request: ReportRequest) {
  const query = new URLSearchParams(
    Object.entries(request).map(([key, value]) => [key, String(value)]),
  );
  return `/admin/analytics/data?${query}`;
}

// What the reports return.
const count = z.number().int().nonnegative();
const figure = z.number().nonnegative().nullable();
const bucket = z.enum(["hour", "day", "week", "month"]);
export type Bucket = z.infer<typeof bucket>;
/** A bucket start in the viewer's time zone, without an offset: 2026-09-26T14:00. */
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const siteTotals = z.object({
  visitors: count,
  visits: count,
  page_views: count,
  views_per_visit: figure,
  bounce_rate: figure,
  visit_duration: figure,
});
const sitePoint = siteTotals.extend({ start: localTime });

export const overviewSchema = z.object({
  range: z.enum(RANGE_VALUES),
  bucket,
  from: localTime,
  totals: siteTotals,
  previous: siteTotals.nullable(),
  series: z.array(sitePoint),
  previous_series: z.array(sitePoint).nullable(),
});
export type Overview = z.infer<typeof overviewSchema>;
export type SiteMetric = keyof z.infer<typeof siteTotals>;

const breakdownRow = z.object({
  value: z.string().nullable(),
  detail: z.string().nullable().optional(),
  visitors: count,
  page_views: count.optional(),
  time_on_page: figure.optional(),
  visits: count.optional(),
  bounce_rate: figure.optional(),
  visit_duration: figure.optional(),
  exits: count.optional(),
  exit_rate: figure.optional(),
  clicks: count.optional(),
});
export type BreakdownRow = z.infer<typeof breakdownRow>;

export const breakdownSchema = z.object({
  range: z.enum(RANGE_VALUES),
  dimension: z.enum(DIMENSION_VALUES),
  total: count,
  visitors: count,
  rows: z.array(breakdownRow),
});
export type Breakdown = z.infer<typeof breakdownSchema>;

export const heatmapSchema = z.object({
  range: z.enum(RANGE_VALUES),
  cells: z.array(
    z.object({
      day: z.number().int().min(1).max(7),
      hour: z.number().int().min(0).max(23),
      visitors: count,
      page_views: count,
    }),
  ),
});
export type Heatmap = z.infer<typeof heatmapSchema>;

const group = z.object({ key: z.string(), visits: count });
export const behaviorSchema = z.object({
  range: z.enum(RANGE_VALUES),
  visits: count,
  pages: z.array(group),
  durations: z.array(group),
  time_on_page: figure,
});
export type Behavior = z.infer<typeof behaviorSchema>;

export const liveSchema = z.object({
  current: count,
  visitors: count,
  page_views: count,
  minutes: z.array(
    z.object({ ago: z.number().int().min(0).max(29), page_views: count, visitors: count }),
  ),
  pages: z.array(z.object({ value: z.string(), visitors: count })),
  sources: z.array(z.object({ value: z.string().nullable(), visits: count })),
  countries: z.array(z.object({ value: z.string().nullable(), visitors: count })),
});
export type Live = z.infer<typeof liveSchema>;

const platformTotals = z.object({
  sign_ups: count,
  products: count,
  connections: count,
  messages: count,
  reports: count,
  feedback: count,
  conversion_rate: figure,
});
const platformPoint = z.object({
  start: localTime,
  sign_ups: count,
  products: count,
  connections: count,
  messages: count,
});
export const platformSchema = z.object({
  range: z.enum(RANGE_VALUES),
  bucket,
  from: localTime,
  now: z.object({
    users: count,
    products: count,
    ranked: count,
    mrr_cents: count,
    connections: count,
  }),
  totals: platformTotals,
  previous: platformTotals.nullable(),
  series: z.array(platformPoint),
  previous_series: z.array(platformPoint).nullable(),
});
export type Platform = z.infer<typeof platformSchema>;
export type PlatformMetric = keyof z.infer<typeof platformPoint> &
  keyof z.infer<typeof platformTotals>;

export const reportSchemas = {
  overview: overviewSchema,
  breakdown: breakdownSchema,
  heatmap: heatmapSchema,
  behavior: behaviorSchema,
  live: liveSchema,
  platform: platformSchema,
} as const;

// How figures read.

const numbers = new Intl.NumberFormat("en-US");
const decimals = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatCount(value: number) {
  return numbers.format(value);
}

/** 12.3% */
export function formatPercent(value: number | null) {
  return value === null ? "-" : `${decimals.format(value)}%`;
}

/** 2.35 pages per visit, shown as 2.35. */
export function formatRatio(value: number | null) {
  return value === null
    ? "-"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

/** 8s, 1m 05s, 1h 02m. */
export function formatDuration(seconds: number | null) {
  if (seconds === null) return "-";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(total / 3600)}h ${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}m`;
}

/** The change from the previous period in percent, or null when there is nothing to compare. */
export function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Bucket starts are local times without an offset; they are read and shown as UTC so no second
// time zone shift happens in the browser.
function localDate(start: string) {
  return new Date(`${start}:00Z`);
}

const axisFormats = {
  hour: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  day: { month: "short", day: "numeric" },
  week: { month: "short", day: "numeric" },
  month: { month: "short", year: "numeric" },
} as const satisfies Record<Bucket, Intl.DateTimeFormatOptions>;

/** "14:00", "Sep 26" or "Sep 2026". */
export function bucketLabel(start: string, bucket: Bucket) {
  return new Intl.DateTimeFormat("en-US", { ...axisFormats[bucket], timeZone: "UTC" }).format(
    localDate(start),
  );
}

const titleFormats = {
  hour: {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
  day: { weekday: "short", month: "short", day: "numeric", year: "numeric" },
  week: { month: "short", day: "numeric", year: "numeric" },
  month: { month: "long", year: "numeric" },
} as const satisfies Record<Bucket, Intl.DateTimeFormatOptions>;

/** "Sat, Sep 26, 14:00", "Sat, Sep 26, 2026", "Week of Sep 21, 2026" or "September 2026". */
export function bucketTitle(start: string, bucket: Bucket) {
  const text = new Intl.DateTimeFormat("en-US", {
    ...titleFormats[bucket],
    timeZone: "UTC",
  }).format(localDate(start));
  return bucket === "week" ? `Week of ${text}` : text;
}

const regions = new Intl.DisplayNames(["en"], { type: "region" });
const languages = new Intl.DisplayNames(["en"], { type: "language" });

function displayName(names: Intl.DisplayNames, code: string | null | undefined) {
  if (!code) return "Unknown";
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export const countryName = (code: string | null | undefined) => displayName(regions, code);
export const languageName = (code: string | null | undefined) => displayName(languages, code);

const deviceNames: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
  other: "Other",
};

/** What a breakdown row is called on screen. */
export function dimensionValue(dimension: Dimension, row: Pick<BreakdownRow, "value" | "detail">) {
  const { value, detail } = row;
  switch (dimension) {
    case "source":
    case "referrer":
    case "channel":
      return value ?? "Direct or unknown";
    case "country":
      return countryName(value);
    case "city":
      return value ? `${value}${detail ? `, ${countryName(detail)}` : ""}` : "Unknown";
    case "language":
      return languageName(value);
    case "device":
      return value ? (deviceNames[value] ?? value) : "Unknown";
    default:
      return value ?? "Unknown";
  }
}

export const pageGroups: Record<string, string> = {
  "1": "1 page",
  "2": "2 pages",
  "3-5": "3 to 5 pages",
  "6-10": "6 to 10 pages",
  "11+": "11 or more pages",
};

export const durationGroups: Record<string, string> = {
  "0-10s": "Under 10 seconds",
  "10-30s": "10 to 30 seconds",
  "30-60s": "30 seconds to 1 minute",
  "1-3m": "1 to 3 minutes",
  "3-10m": "3 to 10 minutes",
  "10-30m": "10 to 30 minutes",
  "30m+": "30 minutes or more",
};

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// Chart axes.

/** A zero-based axis: its top and the ticks from 0, in round steps, four or five of them. */
export function chartAxis(max: number, whole: boolean) {
  const safe = Number.isFinite(max) && max > 0 ? max : whole ? 4 : 1;
  const raw = safe / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((value) => value >= raw)!;
  if (whole) step = Math.max(1, Math.ceil(step));
  const top = step * Math.ceil(safe / step);
  const ticks: number[] = [];
  for (let tick = 0; tick <= top + step / 2; tick += step) ticks.push(Number(tick.toFixed(6)));
  return { top, ticks };
}

/** Which of n points carry an axis label: at most `count`, evenly spread, first and last kept. */
export function labelIndices(n: number, count: number) {
  if (n <= 0) return [];
  if (n <= count) return [...Array(n).keys()];
  return [
    ...new Set(Array.from({ length: count }, (_, j) => Math.round((j * (n - 1)) / (count - 1)))),
  ];
}
