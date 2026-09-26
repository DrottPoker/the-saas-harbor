"use client";

import { useState, useSyncExternalStore } from "react";
import { BarList } from "@/components/charts/bar-list";
import { Growth } from "@/components/charts/growth";
import { formatUsd } from "@/lib/domain";
import {
  DEFAULT_RANGE,
  RANGE_VALUES,
  bucketLabel,
  bucketTitle,
  countryName,
  dimensionValue,
  durationGroups,
  formatCount,
  formatDuration,
  formatPercent,
  formatRatio,
  pageGroups,
  percentChange,
  previousLabel,
  rangeLabel,
  type Behavior,
  type Breakdown,
  type Dimension,
  type Heatmap,
  type Live,
  type Overview,
  type Platform,
  type PlatformMetric,
  type Range,
  type SiteMetric,
} from "@/lib/analytics-reports";
import { AnalyticsCard, Stat } from "./card";
import { BreakdownTable } from "./breakdown-table";
import { ColumnChart } from "./column-chart";
import { PeriodControl, TabPanel, Tabs } from "./controls";
import { HeatmapChart } from "./heatmap";
import { TimeChart, type ChartPoint } from "./time-chart";
import { useReport } from "./use-report";

const CARDS = [
  "overview",
  "pages",
  "sources",
  "locations",
  "technology",
  "heatmap",
  "behavior",
  "outbound",
  "platform",
] as const;
type Card = (typeof CARDS)[number];
type Ranges = Record<Card, Range>;

// Each admin's periods are remembered in their browser; losing them only resets the defaults.
const STORAGE_KEY = "harbor-analytics-ranges";

function initialRanges(): Ranges {
  const ranges = Object.fromEntries(CARDS.map((card) => [card, DEFAULT_RANGE])) as Ranges;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    for (const card of CARDS) {
      const value = saved[card];
      if (typeof value === "string" && (RANGE_VALUES as string[]).includes(value))
        ranges[card] = value as Range;
    }
  } catch {
    // Blocked or unreadable storage: the defaults apply.
  }
  return ranges;
}

const noSubscription = () => () => {};

/** The viewer's time zone, known only in the browser. */
function useTimeZone() {
  return useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => null,
  );
}

type CardProps = { tz: string; range: Range; onRange: (range: Range) => void };

function change(
  current: number | null,
  previous: number | null | undefined,
  range: Range,
  lowerIsBetter = false,
) {
  const pct = previous === undefined ? null : percentChange(current, previous);
  if (pct === null) return null;
  return (
    <Growth
      pct={pct}
      lowerIsBetter={lowerIsBetter}
      period={{ short: null, long: `compared with ${previousLabel(range)}` }}
    />
  );
}

function points<T extends { start: string }>(
  series: T[],
  previous: T[] | null,
  bucket: Overview["bucket"],
  value: (point: T) => number | null,
): ChartPoint[] {
  return series.map((point, i) => {
    const before = previous?.[i];
    return {
      key: point.start,
      axis: bucketLabel(point.start, bucket),
      title: bucketTitle(point.start, bucket),
      value: value(point),
      previous: before ? { title: bucketTitle(before.start, bucket), value: value(before) } : null,
    };
  });
}

// The overview: key figures, each of which the chart can show.

const SITE_METRICS: {
  key: SiteMetric;
  label: string;
  format: (value: number) => string;
  whole: boolean;
  lowerIsBetter?: boolean;
}[] = [
  { key: "visitors", label: "Visitors", format: formatCount, whole: true },
  { key: "visits", label: "Visits", format: formatCount, whole: true },
  { key: "page_views", label: "Page views", format: formatCount, whole: true },
  { key: "views_per_visit", label: "Pages per visit", format: formatRatio, whole: false },
  {
    key: "bounce_rate",
    label: "Bounce rate",
    format: (v) => formatPercent(v),
    whole: false,
    lowerIsBetter: true,
  },
  { key: "visit_duration", label: "Visit length", format: (v) => formatDuration(v), whole: false },
];

function OverviewCard({ tz, range, onRange }: CardProps) {
  const [metric, setMetric] = useState<SiteMetric>("visitors");
  const report = useReport<Overview>({ report: "overview", range, tz });
  const data = report.data;
  const chosen = SITE_METRICS.find((item) => item.key === metric)!;
  return (
    <AnalyticsCard
      id="overview"
      title="Overview"
      description="Pick a figure to chart it. The dashed line is the period before."
      range={range}
      onRange={onRange}
      loading={report.loading}
      error={report.error}
      onRetry={report.retry}
      ready={!!data}
      placeholder="h-96"
      className="lg:col-span-2"
    >
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {SITE_METRICS.map((item) => {
              const value = data.totals[item.key];
              return (
                <Stat
                  key={item.key}
                  label={item.label}
                  value={value === null ? "-" : item.format(value)}
                  detail={change(value, data.previous?.[item.key], data.range, item.lowerIsBetter)}
                  pressed={metric === item.key}
                  onPress={() => setMetric(item.key)}
                />
              );
            })}
          </div>
          <div className="mt-5">
            <TimeChart
              label={`${chosen.label}, ${rangeLabel(data.range).toLowerCase()}`}
              points={points(data.series, data.previous_series, data.bucket, (p) => p[metric])}
              format={chosen.format}
              whole={chosen.whole}
              seriesName={rangeLabel(data.range)}
              previousName={`Previous ${rangeLabel(data.range).replace(/^Last /, "")}`}
            />
          </div>
        </>
      )}
    </AnalyticsCard>
  );
}

// Live: the last 30 minutes, read again every 30 seconds.

function LiveList({
  title,
  rows,
  unit,
}: {
  title: string;
  rows: { label: string; value: number }[];
  unit: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>
      {rows.length ? (
        <ul className="grid gap-1 text-sm">
          {rows.map((row) => (
            <li key={row.label} className="flex justify-between gap-3">
              <span className="truncate" title={row.label}>
                {row.label}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatCount(row.value)}
                <span className="sr-only"> {unit}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      )}
    </div>
  );
}

function LiveCard() {
  const report = useReport<Live>({ report: "live" }, 30_000);
  const data = report.data;
  return (
    <AnalyticsCard
      id="live"
      title="Right now"
      description="The last 30 minutes, updated every 30 seconds."
      loading={report.loading}
      error={report.error}
      onRetry={report.retry}
      ready={!!data}
      placeholder="h-40"
      className="lg:col-span-2"
    >
      {data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="relative flex size-2.5 self-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-1 opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2.5 rounded-full bg-chart-1" />
              </span>
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatCount(data.current)}
              </span>
              <span className="text-sm text-muted-foreground">
                {data.current === 1 ? "visitor" : "visitors"} in the last 5 minutes
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCount(data.visitors)} {data.visitors === 1 ? "visitor" : "visitors"} and{" "}
              {formatCount(data.page_views)} page {data.page_views === 1 ? "view" : "views"} in 30
              minutes.
            </p>
            <div className="mt-4">
              <ColumnChart
                caption="Page views per minute, the last 30 minutes"
                unit={["page view", "page views"]}
                points={data.minutes.map((minute) => ({
                  key: String(minute.ago),
                  label: minute.ago === 0 ? "this minute" : `${minute.ago} min ago`,
                  value: minute.page_views,
                }))}
              />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <LiveList
              title="Pages"
              unit="visitors"
              rows={data.pages.map((row) => ({ label: row.value, value: row.visitors }))}
            />
            <LiveList
              title="Sources"
              unit="visits"
              rows={data.sources.map((row) => ({
                label: dimensionValue("source", row),
                value: row.visits,
              }))}
            />
            <LiveList
              title="Countries"
              unit="visitors"
              rows={data.countries.map((row) => ({
                label: countryName(row.value),
                value: row.visitors,
              }))}
            />
          </div>
        </div>
      )}
    </AnalyticsCard>
  );
}

// Breakdowns: a card with tabs, each tab one dimension.

type Tab = { value: string; label: string; dimension: Dimension; empty?: string };

function BreakdownCard({
  id,
  title,
  description,
  tabs,
  campaign,
  tz,
  range,
  onRange,
}: CardProps & {
  id: string;
  title: string;
  description?: string;
  tabs: Tab[];
  /** A tab whose dimension is chosen among the campaign tags. */
  campaign?: string;
}) {
  const [tab, setTab] = useState(tabs[0].value);
  const [tag, setTag] = useState<Dimension>("utm_campaign");
  const [expanded, setExpanded] = useState(false);
  const current = tabs.find((item) => item.value === tab)!;
  const dimension = tab === campaign ? tag : current.dimension;
  const report = useReport<Breakdown>({
    report: "breakdown",
    range,
    tz,
    dimension,
    limit: expanded ? 100 : 10,
  });
  const data = report.data;
  const body = data && (
    <BreakdownTable
      report={data}
      caption={`${title}: ${current.label}, ${rangeLabel(data.range).toLowerCase()}`}
      expanded={expanded}
      onExpand={setExpanded}
      empty={current.empty ?? "Nothing in this period."}
    />
  );
  return (
    <AnalyticsCard
      id={id}
      title={title}
      description={description}
      range={range}
      onRange={onRange}
      loading={report.loading}
      error={report.error}
      onRetry={report.retry}
      ready={!!data}
      placeholder="h-72"
    >
      {tabs.length > 1 ? (
        <>
          <Tabs
            id={id}
            label={title}
            value={tab}
            options={tabs}
            onChange={(value) => {
              setTab(value);
              setExpanded(false);
            }}
          />
          <TabPanel id={id} value={tab}>
            {tab === campaign && (
              <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                Tag
                <select
                  value={tag}
                  onChange={(event) => {
                    setTag(event.target.value as Dimension);
                    setExpanded(false);
                  }}
                  className="rounded-md border bg-surface px-2 py-1 text-sm text-foreground"
                >
                  {(
                    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {body}
          </TabPanel>
        </>
      ) : (
        body
      )}
    </AnalyticsCard>
  );
}

function HeatmapCard({ tz, range, onRange }: CardProps) {
  const report = useReport<Heatmap>({ report: "heatmap", range, tz });
  return (
    <AnalyticsCard
      id="heatmap"
      title="When people visit"
      description="Visitors by weekday and hour, in your time zone."
      range={range}
      onRange={onRange}
      loading={report.loading}
      error={report.error}
      onRetry={report.retry}
      ready={!!report.data}
      placeholder="h-64"
      className="lg:col-span-2"
    >
      {report.data && <HeatmapChart report={report.data} />}
    </AnalyticsCard>
  );
}

function BehaviorCard({ tz, range, onRange }: CardProps) {
  const report = useReport<Behavior>({ report: "behavior", range, tz });
  const data = report.data;
  const share = (visits: number) =>
    data?.visits ? `${formatCount(visits)} (${formatPercent((100 * visits) / data.visits)})` : "0";
  return (
    <AnalyticsCard
      id="behavior"
      title="Visits"
      description="How many pages a visit took, and how long it lasted."
      range={range}
      onRange={onRange}
      loading={report.loading}
      error={report.error}
      onRetry={report.retry}
      ready={!!data}
      placeholder="h-72"
    >
      {data && (
        <div className="grid gap-6">
          <p className="text-sm text-muted-foreground">
            {formatCount(data.visits)} {data.visits === 1 ? "visit" : "visits"}. A page is visible{" "}
            <span className="font-medium text-foreground">{formatDuration(data.time_on_page)}</span>{" "}
            on average.
          </p>
          <div>
            <h3 className="mb-3 text-xs font-medium text-muted-foreground">Pages per visit</h3>
            <BarList
              label="Visits by pages per visit"
              rows={data.pages.map((row) => ({
                label: pageGroups[row.key] ?? row.key,
                value: row.visits,
                text: share(row.visits),
              }))}
            />
          </div>
          <div>
            <h3 className="mb-3 text-xs font-medium text-muted-foreground">Visit length</h3>
            <BarList
              label="Visits by length"
              rows={data.durations.map((row) => ({
                label: durationGroups[row.key] ?? row.key,
                value: row.visits,
                text: share(row.visits),
              }))}
            />
          </div>
        </div>
      )}
    </AnalyticsCard>
  );
}

// The platform: what users did, next to the visits.

const PLATFORM_METRICS: { key: PlatformMetric; label: string }[] = [
  { key: "sign_ups", label: "Sign-ups" },
  { key: "products", label: "New products" },
  { key: "connections", label: "Provider connections" },
  { key: "messages", label: "Messages" },
];

function PlatformCard({ tz, range, onRange }: CardProps) {
  const [metric, setMetric] = useState<PlatformMetric>("sign_ups");
  const report = useReport<Platform>({ report: "platform", range, tz });
  const data = report.data;
  const chosen = PLATFORM_METRICS.find((item) => item.key === metric)!;
  return (
    <AnalyticsCard
      id="platform"
      title="Platform"
      description="Accounts, products and activity. Deleted accounts and products no longer count."
      range={range}
      onRange={onRange}
      loading={report.loading}
      error={report.error}
      onRetry={report.retry}
      ready={!!data}
      placeholder="h-96"
      className="lg:col-span-2"
    >
      {data && (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-subtle px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ["Accounts", formatCount(data.now.users)],
                ["Listed products", formatCount(data.now.products)],
                ["Ranked products", formatCount(data.now.ranked)],
                ["Verified MRR, ranked", formatUsd(data.now.mrr_cents)],
                ["Connected providers", formatCount(data.now.connections)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Totals now. Below: {rangeLabel(data.range).toLowerCase()}.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {PLATFORM_METRICS.map((item) => (
              <Stat
                key={item.key}
                label={item.label}
                value={formatCount(data.totals[item.key])}
                detail={change(data.totals[item.key], data.previous?.[item.key], data.range)}
                pressed={metric === item.key}
                onPress={() => setMetric(item.key)}
              />
            ))}
            <Stat
              label="Reports"
              value={formatCount(data.totals.reports)}
              detail={change(data.totals.reports, data.previous?.reports, data.range, true)}
            />
            <Stat
              label="Feedback"
              value={formatCount(data.totals.feedback)}
              detail={change(data.totals.feedback, data.previous?.feedback, data.range)}
            />
            <Stat
              label="Sign-ups per 100 visitors"
              value={formatRatio(data.totals.conversion_rate)}
              detail={change(
                data.totals.conversion_rate,
                data.previous?.conversion_rate,
                data.range,
              )}
            />
          </div>
          <div className="mt-5">
            <TimeChart
              label={`${chosen.label}, ${rangeLabel(data.range).toLowerCase()}`}
              points={points(data.series, data.previous_series, data.bucket, (p) => p[metric])}
              format={formatCount}
              seriesName={rangeLabel(data.range)}
              previousName={`Previous ${rangeLabel(data.range).replace(/^Last /, "")}`}
            />
          </div>
        </>
      )}
    </AnalyticsCard>
  );
}

/**
 * The Analytics page: every card has its own period, and the row above sets all of them at once.
 * Reports load in the browser, in the viewer's time zone, so a new period never reloads the page
 * or moves it.
 */
export function AnalyticsDashboard() {
  const tz = useTimeZone();
  const [ranges, setRanges] = useState<Ranges | null>(null);
  // Read once in the browser; the server renders only the placeholder.
  const current = ranges ?? (tz ? initialRanges() : null);

  function save(next: Ranges) {
    setRanges(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Blocked storage: the choice lasts until the page is left.
    }
  }

  if (!tz || !current)
    return <div aria-hidden="true" className="h-96 animate-pulse rounded-xl bg-muted" />;

  const set = (card: Card) => (range: Range) => save({ ...current, [card]: range });
  const shared = CARDS.every((card) => current[card] === current.overview)
    ? current.overview
    : null;
  const card = (name: Card): CardProps => ({ tz, range: current[name], onRange: set(name) });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Every card</span>
          <PeriodControl
            label="Period for every card"
            value={shared}
            onChange={(range) =>
              save(Object.fromEntries(CARDS.map((name) => [name, range])) as Ranges)
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">Times in {tz.replaceAll("_", " ")}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <OverviewCard {...card("overview")} />
        <LiveCard />
        <BreakdownCard
          id="pages"
          title="Pages"
          tabs={[
            { value: "page", label: "Pages", dimension: "page" },
            { value: "entry", label: "Entry pages", dimension: "entry_page" },
            { value: "exit", label: "Exit pages", dimension: "exit_page" },
          ]}
          {...card("pages")}
        />
        <BreakdownCard
          id="sources"
          title="Sources"
          description="A campaign tag wins over the linking site."
          tabs={[
            { value: "channel", label: "Channels", dimension: "channel" },
            { value: "source", label: "Sources", dimension: "source" },
            { value: "referrer", label: "Referring sites", dimension: "referrer" },
            {
              value: "campaign",
              label: "Campaigns",
              dimension: "utm_campaign",
              empty: "No visits with this campaign tag in this period.",
            },
          ]}
          campaign="campaign"
          {...card("sources")}
        />
        <BreakdownCard
          id="locations"
          title="Locations"
          description="From the visitor's IP address and browser language."
          tabs={[
            { value: "country", label: "Countries", dimension: "country" },
            { value: "city", label: "Cities", dimension: "city" },
            { value: "language", label: "Languages", dimension: "language" },
          ]}
          {...card("locations")}
        />
        <BreakdownCard
          id="technology"
          title="Technology"
          tabs={[
            { value: "device", label: "Devices", dimension: "device" },
            { value: "browser", label: "Browsers", dimension: "browser" },
            { value: "browser_version", label: "Browser versions", dimension: "browser_version" },
            { value: "os", label: "Systems", dimension: "os" },
            { value: "os_version", label: "System versions", dimension: "os_version" },
          ]}
          {...card("technology")}
        />
        <HeatmapCard {...card("heatmap")} />
        <BehaviorCard {...card("behavior")} />
        <BreakdownCard
          id="outbound"
          title="Links to other sites"
          description="Clicks on links that leave the site, such as a product's website."
          tabs={[
            {
              value: "outbound",
              label: "Links",
              dimension: "outbound",
              empty: "No clicks on links to other sites in this period.",
            },
          ]}
          {...card("outbound")}
        />
        <PlatformCard {...card("platform")} />
      </div>
    </>
  );
}
