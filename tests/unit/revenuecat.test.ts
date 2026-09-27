import { describe, expect, it } from "vitest";
import { mrrAt } from "../../src/lib/revenue/history";
import { parseRevenueCatKey, parseRevenueCatProject } from "../../src/lib/revenue/revenuecat/key";
import {
  chartCurrency,
  chartPoints,
  dailyResolution,
  revenueCatMrr,
  revenueCatServiceLines,
  untaxedSelectors,
} from "../../src/lib/revenue/revenuecat/mrr";

const DAY = 86_400;
const START = Date.UTC(2026, 8, 20) / 1000;

describe("RevenueCat keys", () => {
  it("takes the project from an ID or a dashboard address", () => {
    expect(parseRevenueCatProject(" proj1ab2c3d4 ")).toBe("proj1ab2c3d4");
    expect(
      parseRevenueCatProject("https://app.revenuecat.com/projects/proj1ab2c3d4/overview"),
    ).toBe("proj1ab2c3d4");
    expect(() => parseRevenueCatProject("no project here")).toThrow(/project ID/);
  });

  it("accepts secret keys only, stored with their project", () => {
    const parsed = parseRevenueCatKey({ key: "sk_AbCdEfGhIjKl1234", account: "proj1ab2c3d4" });
    expect(parsed).toEqual({
      key: "proj1ab2c3d4:sk_AbCdEfGhIjKl1234",
      livemode: true,
      hint: "proj1ab2c3d4 · sk_…1234",
    });
    expect(() =>
      parseRevenueCatKey({ key: "appl_AbCdEfGhIjKl1234", account: "proj1ab2c3d4" }),
    ).toThrow(/public SDK key/);
    expect(() =>
      parseRevenueCatKey({ key: "sk_live_AbCdEfGhIjKl1234", account: "proj1ab2c3d4" }),
    ).toThrow(/another payment provider/);
  });
});

describe("RevenueCat charts", () => {
  it("finds the daily resolution and the selector for revenue without tax", () => {
    expect(
      dailyResolution({
        resolutions: [
          { id: "0", display_name: "day" },
          { id: "2", display_name: "month" },
        ],
      }),
    ).toBe("0");
    expect(dailyResolution({ resolutions: [{ id: "2", display_name: "month" }] })).toBeNull();
    expect(
      untaxedSelectors({
        user_selectors: {
          revenue_type: { options: [{ id: "revenue" }, { id: "revenue_net_of_taxes" }] },
        },
      }),
    ).toEqual({ revenue_type: "revenue_net_of_taxes" });
    expect(untaxedSelectors({ user_selectors: {} })).toBeNull();
  });

  it("reads points as rows or as objects, for the named measure", () => {
    const rows = {
      measures: [{ display_name: "Movement" }, { display_name: "MRR" }],
      values: [
        [(START + DAY) * 1000, 5, 110.5],
        [START, 4, 100],
      ],
      yaxis_currency: "EUR",
    };
    expect(chartPoints(rows, /mrr/i)).toEqual([
      { at: START, value: 100 },
      { at: START + DAY, value: 110.5 },
    ]);
    expect(chartCurrency(rows)).toBe("eur");
    const objects = {
      values: [
        { cohort: START, measure: 0, value: 42 },
        { cohort: START, measure: 1, value: 7 },
        { date: "2026-09-21", measure: 0, value: 43 },
      ],
    };
    expect(chartPoints(objects, /activ/i)).toEqual([
      { at: START, value: 42 },
      { at: START + DAY, value: 43 },
    ]);
    expect(chartCurrency(objects)).toBe("usd");
  });

  it("gives the latest value as MRR, and each day's value as the history", () => {
    const points = [
      { at: START, value: 100 },
      { at: START + DAY, value: 150.25 },
    ];
    expect(revenueCatMrr(points, "usd")).toEqual({ usd: 15025 });
    expect(revenueCatMrr([], "usd")).toEqual({});
    const now = new Date((START + DAY + 3600) * 1000);
    const lines = revenueCatServiceLines(points, "usd", now);
    expect(mrrAt(lines, START + 3600)).toEqual({ usd: 10000 });
    expect(mrrAt(lines, START + DAY + 3600)).toEqual({ usd: 15025 });
    expect(mrrAt(lines, START + 2 * DAY)).toEqual({ usd: 15025 });
  });
});
