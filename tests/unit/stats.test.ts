import { describe, expect, it } from "vitest";
import { ageLabel, bucketLabel, historyPoints, parseStats, percent } from "../../src/lib/stats";

const result = {
  ranked: 4,
  mrr_cents: 2155000,
  median_mrr_cents: 77500,
  customers: 52,
  customer_products: 3,
  buckets: [
    { min_cents: 0, max_cents: 0, products: 1 },
    { min_cents: 1, max_cents: 99999, products: 1 },
    { min_cents: 100000, max_cents: 999999, products: 1 },
    { min_cents: 1000000, max_cents: 9999999, products: 1 },
    { min_cents: 10000000, max_cents: null, products: 0 },
  ],
  categories: [{ category: "Finance", products: 2, mrr_cents: 2150000, median_mrr_cents: 1075000 }],
  growth: { products: 3, median_pct: 0, growing: 1, shrinking: 1, flat: 1 },
  ages: [{ min_years: 0, max_years: 1, products: 1, median_mrr_cents: 5000 }],
  history: [{ month: "2026-07", mrr_cents: 2044000 }],
  fastest: [{ slug: "stats-mid", name: "Stats Mid", mrr_cents: 150000, mrr_growth_pct: 10 }],
};

describe("statistics", () => {
  it("reads the database's result", () => {
    const stats = parseStats(result);
    expect(stats.median_mrr_cents).toBe(77500);
    expect(historyPoints(stats)).toEqual([{ month: "2026-07", cents: 2044000 }]);
  });

  it("refuses a malformed result instead of showing a wrong figure", () => {
    expect(() => parseStats({ ...result, ranked: -1 })).toThrow();
    expect(() => parseStats({ ...result, history: [{ month: "July", mrr_cents: 1 }] })).toThrow();
    expect(() => parseStats(null)).toThrow();
  });

  it("names the MRR buckets in whole dollars", () =>
    expect(result.buckets.map(bucketLabel)).toEqual([
      "$0",
      "Under $1,000",
      "$1,000 to $9,999",
      "$10,000 to $99,999",
      "$100,000 or more",
    ]));

  it("names the time since launch", () =>
    expect(
      [
        { min_years: 0, max_years: 1 },
        { min_years: 1, max_years: 2 },
        { min_years: 5, max_years: null },
      ].map(ageLabel),
    ).toEqual(["Less than a year ago", "1 to 2 years ago", "5 or more years ago"]));

  it("gives whole percentages and none of nothing", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBe(0);
  });
});
