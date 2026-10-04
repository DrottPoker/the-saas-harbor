import { describe, expect, it } from "vitest";
import {
  compactUsd,
  monthLabel,
  changePct,
  chartPeriods,
  historySince,
  mrrChartModel,
  niceScale,
  parseHistory,
  parseRevenueHistory,
  revenueChartModel,
  sparklinePoints,
} from "../../src/lib/charts";

describe("stored history", () => {
  it("reads month-end values", () =>
    expect(parseHistory([{ month: "2026-08", mrr_cents: 2900 }])).toEqual([
      { month: "2026-08", cents: 2900 },
    ]));

  it("rejects anything malformed", () => {
    for (const value of [
      null,
      "[]",
      [],
      [{ month: "2026-13", mrr_cents: 1 }],
      [{ month: "2026-08", mrr_cents: -1 }],
      [{ month: "2026-08", mrr_cents: 1.5 }],
      [{ month: "2026-08" }],
    ])
      expect(parseHistory(value)).toBeNull();
  });
});

describe("history since the product had one", () => {
  const months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
  const history = (cents: number[]) => months.map((month, i) => ({ month, cents: cents[i]! }));

  it("starts at the first month with an amount", () =>
    expect(
      historySince(history([0, 0, 0, 900, 1200, 1500]), { listedAt: "2026-03-02T10:00:00Z" }),
    ).toEqual(history([0, 0, 0, 900, 1200, 1500]).slice(3)));

  it("or at the launch or listing month, whichever is earliest", () => {
    const flat = history([0, 0, 0, 0, 0, 0]);
    expect(historySince(flat, { listedAt: "2026-02-20T08:00:00Z" })).toEqual(flat.slice(4));
    expect(
      historySince(flat, { launchedOn: "2025-12-01", listedAt: "2026-02-20T08:00:00Z" }),
    ).toEqual(flat.slice(2));
    // Revenue before the launch date still shows.
    expect(historySince(history([0, 300, 0, 0, 0, 0]), { launchedOn: "2026-01-15" })).toEqual(
      history([0, 300, 0, 0, 0, 0]).slice(1),
    );
  });

  it("is empty when the product joined after the history ends, and whole without dates", () => {
    const flat = history([0, 0, 0, 0, 0, 0]);
    expect(historySince(flat, { listedAt: "2026-04-01T00:00:00Z" })).toBeNull();
    expect(historySince(flat, {})).toEqual(flat);
    expect(historySince(null, { listedAt: "2026-01-01" })).toBeNull();
  });
});

describe("axis scale", () => {
  it("rounds up to clean steps from zero", () => {
    expect(niceScale(2900)).toEqual({ max: 3000, ticks: [0, 1000, 2000, 3000] });
    // Whole dollars only, never $2.50 steps.
    expect(niceScale(999).ticks).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(niceScale(1250).ticks).toEqual([0, 500, 1000, 1500]);
    expect(niceScale(104_000).ticks).toEqual([0, 25_000, 50_000, 75_000, 100_000, 125_000]);
    expect(niceScale(100_000)).toEqual({
      max: 100_000,
      ticks: [0, 25_000, 50_000, 75_000, 100_000],
    });
  });

  it("always gives three to five distinct, covering intervals", () => {
    for (let max = 1; max < 1e11; max = Math.ceil(max * 1.37)) {
      const scale = niceScale(max);
      expect(scale.max).toBeGreaterThanOrEqual(max);
      expect(scale.ticks.length).toBeGreaterThanOrEqual(4);
      expect(scale.ticks.length).toBeLessThanOrEqual(6);
      expect(new Set(scale.ticks.map(compactUsd)).size).toBe(scale.ticks.length);
    }
  });

  it("gives an all-zero history a readable axis", () =>
    expect(niceScale(0)).toEqual({ max: 10_000, ticks: [0, 2500, 5000, 7500, 10_000] }));

  it("labels ticks compactly", () => {
    expect(compactUsd(0)).toBe("$0");
    expect(compactUsd(150_000)).toBe("$1.5K");
    expect(compactUsd(125_000)).toBe("$1.25K");
    expect(compactUsd(123_456_789)).toBe("$1.23M");
  });
});

describe("MRR chart model", () => {
  const history = [
    { month: "2025-11", cents: 0 },
    { month: "2025-12", cents: 1000 },
    { month: "2026-01", cents: 2900 },
  ];

  it("places points as fractions of the plot, zero at the bottom", () => {
    const { points } = mrrChartModel(history);
    expect(points.map((p) => [p.x, p.y])).toEqual([
      [0, 1],
      [0.5, 1 - 1000 / 3000],
      [1, 1 - 2900 / 3000],
    ]);
    expect(points.map((p) => p.value)).toEqual(["$0", "$10", "$29"]);
    expect(mrrChartModel([{ month: "2026-01", cents: 931_539 }]).points[0].value).toBe("$9,315");
  });

  it("names months for the axis, tooltips and screen readers", () => {
    const model = mrrChartModel(history);
    expect(model.points.map((p) => p.axisLabel)).toEqual(["Nov ’25", "Dec", "Jan ’26"]);
    expect(model.points.map((p) => p.narrowLabel)).toEqual(["Nov ’25", null, "Jan ’26"]);
    // On narrow plots the year moves to the first shown month of the new year.
    const year = mrrChartModel(
      ["2025-11", "2025-12", "2026-01", "2026-02"].map((month) => ({ month, cents: 100 })),
    );
    expect(year.points.map((p) => p.narrowLabel)).toEqual([null, "Dec ’25", null, "Feb ’26"]);
    // A longer history shows every third month, so labels with a year never touch.
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: `${i < 3 ? 2025 : 2026}-${String(((i + 9) % 12) + 1).padStart(2, "0")}`,
      cents: 100,
    }));
    expect(
      mrrChartModel(months)
        .points.map((p) => p.narrowLabel)
        .filter(Boolean),
    ).toEqual(["Dec ’25", "Mar ’26", "Jun", "Sep"]);
    expect(monthLabel("2026-01")).toBe("January 2026");
    expect(model.summary).toBe(
      "MRR at month end went from $0 in November 2025 to $29 in January 2026.",
    );
    expect(model.ticks.map((t) => t.label)).toEqual(["$0", "$10", "$20", "$30"]);
  });

  it("handles a single month", () => {
    const model = mrrChartModel([{ month: "2026-01", cents: 500 }]);
    expect(model.points[0].x).toBe(1);
    expect(model.summary).toBe("MRR was $5 at the end of January 2026.");
  });
});

describe("stored revenue by month", () => {
  it("reads months with their split, or their total only", () =>
    expect(
      parseRevenueHistory([
        { month: "2026-07", cents: 1200, subscription_cents: 1000, one_time_cents: 200 },
        { month: "2026-08", cents: 900 },
      ]),
    ).toEqual([
      { month: "2026-07", cents: 1200, split: { subscription: 1000, oneTime: 200 } },
      { month: "2026-08", cents: 900, split: null },
    ]));

  it("rejects anything malformed", () => {
    for (const value of [
      null,
      [],
      [{ month: "2026-08", mrr_cents: 1 }],
      [{ month: "2026-08", cents: -1 }],
      [{ month: "2026-08", cents: 1, subscription_cents: 0.5, one_time_cents: 0 }],
    ])
      expect(parseRevenueHistory(value)).toBeNull();
  });
});

describe("revenue chart model", () => {
  const split = (subscription: number, oneTime: number) => ({ subscription, oneTime });
  const history = [
    { month: "2026-06", cents: 0, split: split(0, 0) },
    { month: "2026-07", cents: 1500, split: split(1000, 500) },
    { month: "2026-08", cents: 3000, split: split(3000, 0) },
  ];

  it("centers a column in each month's band, zero at the bottom", () => {
    const { bars } = revenueChartModel(history);
    expect(bars.map((bar) => [bar.x, bar.height])).toEqual([
      [1 / 6, 0],
      [0.5, 0.5],
      [5 / 6, 1],
    ]);
    expect(bars.map((bar) => bar.axisLabel)).toEqual(["Jun ’26", "Jul", "Aug"]);
  });

  it("splits each column into its parts, and totals the period", () => {
    const model = revenueChartModel(history);
    expect(model.bars[1].parts).toEqual({
      subscription: { value: "$10", share: 2 / 3 },
      oneTime: { value: "$5", share: 1 / 3 },
    });
    expect(model.bars[0].parts!.subscription.share).toBe(0);
    expect(model.total).toBe("$45");
    expect(model.totalParts).toEqual({ subscription: "$40", oneTime: "$5" });
    expect(model.summary).toBe("Revenue by month from June 2026 to August 2026, $45 in total.");
  });

  it("shows totals only when any month has no split", () => {
    const model = revenueChartModel([...history, { month: "2026-09", cents: 700, split: null }]);
    expect(model.totalParts).toBeNull();
    expect(model.bars.every((bar) => bar.parts === null)).toBe(true);
  });

  it("handles a single month", () =>
    expect(revenueChartModel([history[1]]).summary).toBe("Revenue was $15 in July 2026."));
});

describe("sparkline", () => {
  const series = (...cents: number[]) =>
    cents.map((value, i) => ({ month: `2026-0${i + 1}`, cents: value }));

  it("uses the full height for real growth", () =>
    expect(sparklinePoints(series(0, 50, 100), 100, 20, 2)).toEqual([
      { x: 2, y: 18 },
      { x: 50, y: 10 },
      { x: 98, y: 2 },
    ]));

  it("keeps small changes small", () => {
    const [before, after] = sparklinePoints(series(97, 100), 100, 30);
    expect(before.y).toBeCloseTo(3, 9);
    expect(after.y).toBe(0);
  });

  it("draws a flat history along the bottom", () =>
    expect(sparklinePoints([{ month: "2026-01", cents: 0 }], 100, 20).at(-1)).toEqual({
      x: 100,
      y: 20,
    }));

  it("offers shorter periods than the history, and the whole history last", () => {
    expect(chartPeriods(12)).toEqual([
      { months: 3, label: "3M", long: "last 3 months" },
      { months: 6, label: "6M", long: "last 6 months" },
      { months: 12, label: "1Y", long: "last 12 months" },
    ]);
    expect(chartPeriods(5)).toEqual([
      { months: 3, label: "3M", long: "last 3 months" },
      { months: 5, label: "All", long: "all 5 months" },
    ]);
    expect(chartPeriods(20).map((p) => p.label)).toEqual(["3M", "6M", "1Y", "All"]);
    expect(chartPeriods(2)).toEqual([{ months: 2, label: "All", long: "all 2 months" }]);
  });

  it("gives the change over a period only when it starts above zero", () => {
    const at = (cents: number[]) => cents.map((c, i) => ({ month: `2026-0${i + 1}`, cents: c }));
    expect(changePct(at([1000, 1500]))).toBe(50);
    expect(changePct(at([2000, 1000]))).toBe(-50);
    expect(changePct(at([0, 1000]))).toBeNull();
    expect(changePct(at([1000]))).toBeNull();
  });
});
