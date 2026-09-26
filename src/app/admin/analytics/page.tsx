import { RankTable, VisitorsChart } from "@/components/admin/analytics";
import { FilterTabs } from "@/components/admin/filters";
import { Panel } from "@/components/admin/panel";
import { Growth } from "@/components/charts/growth";
import { Metric } from "@/components/metric";
import { EmptyState, PageHeader } from "@/components/shell";
import { requireAdmin } from "@/lib/admin";
import {
  ANALYTICS_RANGES,
  DEFAULT_RANGE,
  analyticsPeriod,
  analyticsRange,
  bucketLabel,
  bucketTitle,
  countryName,
  deviceLabels,
  parseAnalytics,
  percentChange,
  type AnalyticsRange,
} from "@/lib/analytics";
import { firstValues, type SearchParams } from "@/lib/params";

export const metadata = { title: "Analytics" };

const card = "flex flex-col justify-between rounded-xl border bg-surface";
const number = new Intl.NumberFormat("en-US");

export default async function AdminAnalytics({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { client } = await requireAdmin();
  const range = analyticsRange(firstValues(await searchParams).range);
  const period = analyticsPeriod(range);
  const { data, error } = await client.rpc("admin_analytics", {
    p_from: period.from,
    p_to: period.to,
    p_bucket: period.bucket,
  });
  if (error) throw new Error("The statistics could not be loaded.");
  const stats = parseAnalytics(data);
  const { label } = ANALYTICS_RANGES[range];
  const href = (next: AnalyticsRange) =>
    next === DEFAULT_RANGE ? "/admin/analytics" : `/admin/analytics?range=${next}`;
  const change = (current: number, previous: number) => {
    const pct = percentChange(current, previous);
    return pct === null ? undefined : (
      <Growth pct={pct} period={{ short: null, long: `compared with the previous ${label}` }} />
    );
  };
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Visits to the site, counted without cookies. Bots, admin pages and signed-in admins are left out."
      />
      <div className="mb-6">
        <FilterTabs
          label="Period"
          current={range}
          options={Object.entries(ANALYTICS_RANGES).map(([value, option]) => ({
            value,
            label: option.label,
            href: href(value as AnalyticsRange),
          }))}
        />
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          className={card}
          label="Visitors"
          value={number.format(stats.visitors)}
          detail={change(stats.visitors, stats.previous.visitors)}
        />
        <Metric
          className={card}
          label="Visits"
          value={number.format(stats.visits)}
          detail={change(stats.visits, stats.previous.visits)}
        />
        <Metric
          className={card}
          label="Page views"
          value={number.format(stats.page_views)}
          detail={change(stats.page_views, stats.previous.page_views)}
        />
        <Metric
          className={card}
          label="Last 30 minutes"
          value={`${number.format(stats.live)} ${stats.live === 1 ? "visitor" : "visitors"}`}
        />
      </dl>
      <p className="mt-3 text-[13px] text-faint-foreground">
        A visitor is counted once a day. A visit starts after 30 minutes without a page view.
        Changes compare with the previous {label}. Times are in UTC.
      </p>

      {stats.page_views === 0 ? (
        <div className="mt-10">
          <EmptyState title="No visits in this period">
            Page views appear here as people visit the site.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-10 grid gap-6">
          <Panel id="visitors" title="Visitors" description={`The last ${label}.`}>
            <VisitorsChart
              caption={`Visitors and page views, the last ${label}`}
              points={stats.series.map((point) => ({
                key: point.start,
                label: bucketLabel(point.start, period.bucket),
                long: bucketTitle(point.start, period.bucket),
                visitors: point.visitors,
                pageViews: point.page_views,
              }))}
            />
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel id="pages" title="Pages">
              <RankTable
                caption="The most viewed pages"
                heading="Page"
                columns={["Visitors", "Views"]}
                rows={stats.pages.map((page) => ({
                  key: page.path,
                  label: page.path,
                  href: page.path.includes("[id]") ? undefined : page.path,
                  values: [page.visitors, page.page_views],
                }))}
              />
            </Panel>
            <Panel
              id="sources"
              title="Sources"
              description="Where visits came from: a campaign tag, else the linking site."
            >
              <RankTable
                caption="Visits by source"
                heading="Source"
                columns={["Visits"]}
                rows={stats.sources.map((source) => ({
                  key: source.source ?? "",
                  label: source.source ?? "Direct or unknown",
                  values: [source.visits],
                }))}
              />
            </Panel>
            <Panel id="countries" title="Countries">
              <RankTable
                caption="Visitors by country"
                heading="Country"
                columns={["Visitors"]}
                rows={stats.countries.map((country) => ({
                  key: country.country ?? "",
                  label: countryName(country.country),
                  values: [country.visitors],
                }))}
              />
            </Panel>
            <Panel id="devices" title="Devices">
              <RankTable
                caption="Visitors by device"
                heading="Device"
                columns={["Visitors"]}
                rows={stats.devices.map((device) => ({
                  key: device.device,
                  label: deviceLabels[device.device],
                  values: [device.visitors],
                }))}
              />
            </Panel>
            <Panel id="browsers" title="Browsers">
              <RankTable
                caption="Visitors by browser"
                heading="Browser"
                columns={["Visitors"]}
                rows={stats.browsers.map((browser) => ({
                  key: browser.browser,
                  label: browser.browser,
                  values: [browser.visitors],
                }))}
              />
            </Panel>
            <Panel id="systems" title="Operating systems">
              <RankTable
                caption="Visitors by operating system"
                heading="System"
                columns={["Visitors"]}
                rows={stats.systems.map((system) => ({
                  key: system.os,
                  label: system.os,
                  values: [system.visitors],
                }))}
              />
            </Panel>
            {stats.campaigns.length > 0 && (
              <Panel id="campaigns" title="Campaigns" description="Visits by utm_campaign tag.">
                <RankTable
                  caption="Visits by campaign"
                  heading="Campaign"
                  columns={["Visits"]}
                  rows={stats.campaigns.map((campaign) => ({
                    key: campaign.campaign,
                    label: campaign.campaign,
                    values: [campaign.visits],
                  }))}
                />
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );
}
