import { describe, expect, it } from "vitest";
import {
  bucketLabel,
  bucketTitle,
  chartAxis,
  countryName,
  dimensionValue,
  formatDuration,
  formatPercent,
  formatRatio,
  isTimeZone,
  labelIndices,
  languageName,
  overviewSchema,
  percentChange,
  previousLabel,
  rangeLabel,
  reportRequestSchema,
  reportUrl,
} from "../../src/lib/analytics-reports";

describe("analytics reports", () => {
  it("accepts only known reports, periods, breakdowns and time zones", () => {
    const request = {
      report: "breakdown",
      range: "12m",
      tz: "Europe/Stockholm",
      dimension: "utm_campaign",
      limit: "100",
    };
    expect(reportRequestSchema.parse(request)).toEqual({ ...request, limit: 100 });
    expect(reportRequestSchema.parse({ report: "live" })).toEqual({ report: "live" });
    for (const other of [
      { ...request, range: "90d" },
      { ...request, tz: "Nowhere/Nothing" },
      { ...request, dimension: "password" },
      { ...request, limit: "101" },
      { ...request, limit: "0" },
      { report: "overview", range: "7d" },
      { report: "users" },
    ])
      expect(reportRequestSchema.safeParse(other).success).toBe(false);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("")).toBe(false);
  });

  it("builds the address of a report", () => {
    expect(reportUrl({ report: "overview", range: "7d", tz: "America/New_York" })).toBe(
      "/admin/analytics/data?report=overview&range=7d&tz=America%2FNew_York",
    );
    expect(reportUrl({ report: "live" })).toBe("/admin/analytics/data?report=live");
  });

  it("names the periods", () => {
    expect(rangeLabel("24h")).toBe("Last 24 hours");
    expect(rangeLabel("all")).toBe("All time");
    expect(previousLabel("30d")).toBe("the 30 days before");
  });

  it("reads an overview and refuses anything malformed", () => {
    const totals = {
      visitors: 3,
      visits: 3,
      page_views: 5,
      views_per_visit: 1.67,
      bounce_rate: 66.7,
      visit_duration: 111.7,
    };
    const valid = {
      range: "24h",
      bucket: "hour",
      from: "2026-09-25T15:00",
      totals,
      previous: null,
      series: [{ ...totals, start: "2026-09-25T15:00" }],
      previous_series: null,
    };
    expect(overviewSchema.parse(valid)).toEqual(valid);
    expect(overviewSchema.safeParse({ ...valid, totals: { ...totals, visits: -1 } }).success).toBe(
      false,
    );
    expect(overviewSchema.safeParse({ ...valid, bucket: "year" }).success).toBe(false);
    expect(overviewSchema.safeParse({ ...valid, from: "2026-09-25T15:00:00Z" }).success).toBe(
      false,
    );
  });

  it("formats figures", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(8.4)).toBe("8s");
    expect(formatDuration(65)).toBe("1m 05s");
    expect(formatDuration(3720)).toBe("1h 02m");
    expect(formatPercent(66.7)).toBe("66.7%");
    expect(formatPercent(null)).toBe("-");
    expect(formatRatio(1.667)).toBe("1.67");
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(null, 5)).toBeNull();
  });

  it("labels local bucket starts without shifting them", () => {
    const start = "2026-09-26T14:00";
    expect(bucketLabel(start, "hour")).toBe("14:00");
    expect(bucketLabel(start, "day")).toBe("Sep 26");
    expect(bucketLabel(start, "month")).toBe("Sep 2026");
    expect(bucketTitle(start, "hour")).toBe("Sat, Sep 26, 14:00");
    expect(bucketTitle(start, "day")).toBe("Sat, Sep 26, 2026");
    expect(bucketTitle("2026-09-21T00:00", "week")).toBe("Week of Sep 21, 2026");
    expect(bucketTitle(start, "month")).toBe("September 2026");
  });

  it("names breakdown rows", () => {
    expect(dimensionValue("source", { value: null })).toBe("Direct or unknown");
    expect(dimensionValue("country", { value: "SE" })).toBe("Sweden");
    expect(dimensionValue("city", { value: "Göteborg", detail: "SE" })).toBe("Göteborg, Sweden");
    expect(dimensionValue("language", { value: "sv" })).toBe("Swedish");
    expect(dimensionValue("device", { value: "mobile" })).toBe("Mobile");
    expect(dimensionValue("page", { value: "/stats" })).toBe("/stats");
    expect(countryName(null)).toBe("Unknown");
    expect(languageName("xx-invalid-!")).toBe("xx-invalid-!");
  });

  it("builds chart axes in round steps from zero", () => {
    expect(chartAxis(9, true)).toEqual({ top: 9, ticks: [0, 3, 6, 9] });
    expect(chartAxis(0, true)).toEqual({ top: 4, ticks: [0, 1, 2, 3, 4] });
    expect(chartAxis(66.7, false)).toEqual({ top: 80, ticks: [0, 20, 40, 60, 80] });
    expect(chartAxis(0.4, false)).toEqual({ top: 0.4, ticks: [0, 0.1, 0.2, 0.3, 0.4] });
    expect(chartAxis(1234, true)).toEqual({ top: 1500, ticks: [0, 500, 1000, 1500] });
  });

  it("spreads axis labels evenly and keeps the first and last", () => {
    expect(labelIndices(0, 4)).toEqual([]);
    expect(labelIndices(3, 7)).toEqual([0, 1, 2]);
    expect(labelIndices(30, 4)).toEqual([0, 10, 19, 29]);
    expect(labelIndices(24, 7)).toEqual([0, 4, 8, 12, 15, 19, 23]);
  });
});
