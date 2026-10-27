import { describe, expect, it } from "vitest";
import { splitAccountKey } from "../../src/lib/revenue/account-key";
import { mrrAt } from "../../src/lib/revenue/history";
import { parseSuperwallApplication, parseSuperwallKey } from "../../src/lib/revenue/superwall/key";
import {
  chartPoints,
  chartQuery,
  findChart,
  latestValue,
  superwallMrr,
  superwallServiceLines,
  type ChartDefinitions,
} from "../../src/lib/revenue/superwall/mrr";
import { chartPayments } from "../../src/lib/revenue/superwall/payments";

const DAY = 86_400;
const START = Date.UTC(2026, 8, 20) / 1000;

const definitions: ChartDefinitions = {
  chart_types: [
    {
      key: "cohortedProceeds",
      name: "Cohorted Proceeds",
      x_axis: "installDate",
      y_axis: "netProceeds",
      date_dimension: "installDate",
    },
    {
      key: "proceeds",
      name: "Proceeds",
      x_axis: "purchaseDate",
      y_axis: "netProceeds",
      date_dimension: "purchaseDate",
    },
    { key: "mrr", name: "MRR", x_axis: "mrrDate", y_axis: "mrr", date_dimension: "mrrDate" },
    {
      key: "arr",
      name: "ARR",
      x_axis: "mrrDate",
      y_axis: "arr",
      date_dimension: "mrrDate",
    },
    {
      key: "activeSubscriptions",
      name: "Active Subscriptions",
      x_axis: "mrrDate",
      y_axis: "activeSubscriptions",
      date_dimension: "mrrDate",
    },
  ],
};

describe("Superwall keys", () => {
  it("takes the application from an ID or a dashboard address", () => {
    expect(parseSuperwallApplication(" 18342 ")).toBe("18342");
    expect(parseSuperwallApplication("https://app.superwall.com/912/18342/dashboard")).toBe(
      "18342",
    );
    expect(parseSuperwallApplication("https://superwall.com/applications/18342/campaigns")).toBe(
      "18342",
    );
    expect(() => parseSuperwallApplication("https://app.superwall.com/912")).toThrow(
      /application ID/,
    );
    expect(() => parseSuperwallApplication("my app")).toThrow(/application ID/);
  });

  it("accepts organization keys only, stored with their app", () => {
    const parsed = parseSuperwallKey({ key: " sk_AbCdEfGhIjKlMnOp1234 ", account: "18342" });
    expect(parsed).toEqual({
      key: "18342:sk_AbCdEfGhIjKlMnOp1234",
      livemode: true,
      hint: "app 18342 · sk_…1234",
    });
    expect(splitAccountKey(parsed.key)).toEqual({
      account: "18342",
      key: "sk_AbCdEfGhIjKlMnOp1234",
    });
    expect(() => parseSuperwallKey({ key: "pk_AbCdEfGhIjKlMnOp1234", account: "18342" })).toThrow(
      /public SDK key/,
    );
    expect(() =>
      parseSuperwallKey({ key: "sk_live_AbCdEfGhIjKlMnOp1234", account: "18342" }),
    ).toThrow(/another payment provider/);
    expect(() => parseSuperwallKey({ key: "sk_short", account: "18342" })).toThrow(
      /starts with sk_/,
    );
  });
});

describe("Superwall charts", () => {
  it("finds the charts by name, not the cohorted or annual ones", () => {
    expect(findChart(definitions, "mrr")?.key).toBe("mrr");
    expect(findChart(definitions, "proceeds")?.key).toBe("proceeds");
    expect(findChart(definitions, "actives")?.y_axis).toBe("activeSubscriptions");
    expect(findChart({ chart_types: [] }, "mrr")).toBeNull();
    expect(
      findChart(
        {
          chart_types: [
            { key: "mrr", name: "Recurring", x_axis: "a", y_axis: "b", date_dimension: "mrrDate" },
          ],
        },
        "mrr",
      )?.name,
    ).toBe("Recurring");
  });

  it("asks for daily production figures without a breakdown", () => {
    expect(chartQuery("18342", findChart(definitions, "mrr")!, "2025-09-01", "2026-10-24")).toEqual(
      {
        application_id: "18342",
        y_axis: "mrr",
        x_axis: "mrrDate",
        breakdown: null,
        date_filter: {
          dimension: "mrrDate",
          preset: "custom",
          range: { from: "2025-09-01", to: "2026-10-24" },
        },
        date_interval: "day",
        environment: ["PRODUCTION"],
        max_data_points: 1000,
      },
    );
  });

  it("reads one series, a total among several, or their sum", () => {
    const points = chartPoints({
      data: [
        { x: "2026-09-21", incomplete: true, values: { total: { y: 9 }, ios: { y: 4 } } },
        { x: "2026-09-20", incomplete: false, values: { null: { y: 100.5 } } },
        { x: "2026-09-22T00:00:00Z", values: { ios: { y: 2 }, android: { y: 3 } } },
        { x: "not a date", values: { null: { y: 1 } } },
        { x: "2026-09-23", values: { null: null } },
      ],
    });
    expect(points).toEqual([
      { at: START, value: 100.5, incomplete: false },
      { at: START + DAY, value: 9, incomplete: true },
      { at: START + 2 * DAY, value: 5, incomplete: false },
    ]);
  });

  it("gives the latest finished day as MRR, and each day's value as the history", () => {
    const points = [
      { at: START, value: 100, incomplete: false },
      { at: START + DAY, value: 150.25, incomplete: false },
      { at: START + 2 * DAY, value: 151, incomplete: true },
    ];
    expect(latestValue(points)).toBe(150.25);
    expect(latestValue([{ at: START, value: 7, incomplete: true }])).toBe(7);
    expect(latestValue([])).toBe(0);
    expect(superwallMrr(points)).toEqual({ usd: 15025 });
    expect(superwallMrr([])).toEqual({});
    const lines = superwallServiceLines(points, new Date((START + 2 * DAY + 3600) * 1000));
    expect(mrrAt(lines, START + 3600)).toEqual({ usd: 10000 });
    expect(mrrAt(lines, START + DAY + 3600)).toEqual({ usd: 15025 });
    expect(mrrAt(lines, START + 3 * DAY)).toEqual({ usd: 15100 });
  });
});

describe("Superwall payments", () => {
  it("count each day of proceeds in the window as one payment of unknown kind", () => {
    const points = [
      { at: START - DAY, value: 12, incomplete: false },
      { at: START, value: 8.4, incomplete: false },
      { at: START + DAY, value: 0, incomplete: false },
      { at: START + 2 * DAY, value: -3, incomplete: false },
      { at: START + 3 * DAY, value: 5, incomplete: true },
    ];
    expect(chartPayments("18342", points, START, START + 3 * DAY)).toEqual([
      {
        id: "18342:2026-09-20",
        at: START,
        fingerprint: "8.4",
        value: { currency: "usd", amount: 840 },
        kind: "unknown",
      },
      {
        id: "18342:2026-09-22",
        at: START + 2 * DAY,
        fingerprint: "-3",
        value: { currency: "usd", amount: -300 },
        kind: "unknown",
      },
    ]);
    expect(chartPayments("18342", points, START, null)).toHaveLength(3);
  });
});
