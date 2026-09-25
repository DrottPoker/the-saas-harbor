import { describe, expect, it } from "vitest";
import {
  compactUsd,
  monthLabel,
  mrrChartModel,
  niceScale,
  parseHistory,
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
});
