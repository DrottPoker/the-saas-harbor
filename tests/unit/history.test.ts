import { describe, expect, it } from "vitest";
import {
  historyWindowStart,
  linePriceId,
  monthEnds,
  mrrAt,
  serviceLine,
  serviceLines,
  type StripeInvoiceLine,
} from "../../src/lib/stripe/history";
import type { StripePrice } from "../../src/lib/stripe/mrr";

const DAY = 86_400;
const JAN_1 = Date.UTC(2026, 0, 1) / 1000;
const FEB_1 = Date.UTC(2026, 1, 1) / 1000;
const MAR_1 = Date.UTC(2026, 2, 1) / 1000;

function price(id: string, overrides: Partial<StripePrice> = {}): StripePrice {
  return {
    id,
    currency: "usd",
    unit_amount: 2900,
    unit_amount_decimal: "2900",
    billing_scheme: "per_unit",
    tiers_mode: null,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    transform_quantity: null,
    ...overrides,
  };
}

const prices = new Map<string, StripePrice>([
  ["price_month", price("price_month")],
  [
    "price_year",
    price("price_year", {
      unit_amount: 60000,
      recurring: { interval: "year", interval_count: 1, usage_type: "licensed" },
    }),
  ],
  [
    "price_quarter",
    price("price_quarter", {
      recurring: { interval: "month", interval_count: 3, usage_type: "licensed" },
    }),
  ],
  [
    "price_metered",
    price("price_metered", {
      recurring: { interval: "month", interval_count: 1, usage_type: "metered" },
    }),
  ],
  ["price_once", price("price_once", { recurring: null })],
]);

function line(overrides: Partial<StripeInvoiceLine> = {}): StripeInvoiceLine {
  return {
    id: "il_1",
    amount: 2900,
    currency: "usd",
    period: { start: JAN_1, end: FEB_1 },
    discount_amounts: [],
    taxes: [],
    parent: {
      type: "subscription_item_details",
      subscription_item_details: { proration: false, subscription: "sub_1" },
    },
    pricing: { price_details: { price: "price_month" } },
    ...overrides,
  };
}

function prorationLine(amount: number, start: number, end: number) {
  return line({
    amount,
    period: { start, end },
    parent: {
      type: "invoice_item_details",
      invoice_item_details: { proration: true, subscription: "sub_1" },
    },
  });
}

describe("invoice lines", () => {
  it("reads the price id from a string or an expanded price", () => {
    expect(linePriceId(line())).toBe("price_month");
    expect(linePriceId(line({ pricing: { price_details: { price: price("price_x") } } }))).toBe(
      "price_x",
    );
    expect(linePriceId(line({ pricing: null }))).toBeNull();
  });

  it("uses the price's interval, so a short month does not inflate MRR", () => {
    const february = serviceLine(line({ period: { start: FEB_1, end: MAR_1 } }), prices);
    expect(february).toEqual({ start: FEB_1, end: MAR_1, currency: "usd", monthly: 2900 });
  });

  it("normalizes annual and multi-month plans", () => {
    const annual = serviceLine(
      line({
        amount: 60000,
        period: { start: JAN_1, end: JAN_1 + 365 * DAY },
        pricing: { price_details: { price: "price_year" } },
      }),
      prices,
    );
    expect(annual?.monthly).toBe(5000);
    const quarterly = serviceLine(
      line({ amount: 8700, pricing: { price_details: { price: "price_quarter" } } }),
      prices,
    );
    expect(quarterly?.monthly).toBe(2900);
  });

  it("subtracts discounts and inclusive tax, but not exclusive tax", () => {
    const net = serviceLine(
      line({
        amount: 3500,
        discount_amounts: [{ amount: 300 }, { amount: 200 }],
        taxes: [
          { amount: 500, tax_behavior: "inclusive" },
          { amount: 700, tax_behavior: "exclusive" },
        ],
      }),
      prices,
    );
    expect(net?.monthly).toBe(2500);
  });

  it("spreads prorations over their own days", () => {
    const days = 365.25 / 12 / 2;
    const half = serviceLine(prorationLine(1450, JAN_1, JAN_1 + days * DAY), prices);
    expect(half?.monthly).toBeCloseTo(2900, 6);
    const credit = serviceLine(prorationLine(-1450, JAN_1, JAN_1 + days * DAY), prices);
    expect(credit?.monthly).toBeCloseTo(-2900, 6);
  });

  it("skips one-off charges, metered usage and empty periods", () => {
    const oneOff = line({
      parent: {
        type: "invoice_item_details",
        invoice_item_details: { proration: false, subscription: null },
      },
      pricing: { price_details: { price: "price_once" } },
    });
    expect(serviceLine(oneOff, prices)).toBeNull();
    expect(serviceLine(line({ parent: null }), prices)).toBeNull();
    expect(
      serviceLine(line({ pricing: { price_details: { price: "price_metered" } } }), prices),
    ).toBeNull();
    expect(serviceLine(line({ period: { start: JAN_1, end: JAN_1 } }), prices)).toBeNull();
  });

  it("collects the counted lines of every invoice", () => {
    const lines = serviceLines(
      [
        { id: "in_1", lines: { data: [line(), line({ parent: null })], has_more: false } },
        { id: "in_2", lines: { data: [line({ currency: "EUR" })], has_more: false } },
      ],
      prices,
    );
    expect(lines.map((l) => l.currency)).toEqual(["usd", "eur"]);
  });
});

describe("MRR at an instant", () => {
  const lines = [
    { start: JAN_1, end: FEB_1, currency: "usd", monthly: 2900 },
    { start: FEB_1, end: MAR_1, currency: "usd", monthly: 2900 },
    { start: JAN_1, end: MAR_1, currency: "eur", monthly: 4000 },
  ];

  it("counts a period from its start up to, not including, its end", () => {
    expect(mrrAt(lines, JAN_1 - 1)).toEqual({});
    expect(mrrAt(lines, JAN_1)).toEqual({ usd: 2900, eur: 4000 });
    expect(mrrAt(lines, FEB_1)).toEqual({ usd: 2900, eur: 4000 });
    expect(mrrAt(lines, MAR_1)).toEqual({});
  });

  it("nets proration credits and drops currencies that end at or below zero", () => {
    const credited = [
      ...lines,
      { start: JAN_1, end: FEB_1, currency: "usd", monthly: -1000 },
      { start: JAN_1, end: FEB_1, currency: "eur", monthly: -4000 },
    ];
    expect(mrrAt(credited, JAN_1 + DAY)).toEqual({ usd: 1900 });
  });
});

describe("history window", () => {
  it("returns the last second of the twelve completed months, oldest first", () => {
    const points = monthEnds(new Date(Date.UTC(2026, 0, 15, 12)));
    expect(points).toHaveLength(12);
    expect(points[0]).toEqual({ month: "2025-01", at: Date.UTC(2025, 1, 1) / 1000 - 1 });
    expect(points.at(-1)).toEqual({ month: "2025-12", at: JAN_1 - 1 });
  });

  it("treats the first day of a month as the start of an incomplete month", () => {
    const points = monthEnds(new Date(Date.UTC(2026, 2, 1)), 2);
    expect(points.map((p) => p.month)).toEqual(["2026-01", "2026-02"]);
  });

  it("reaches back far enough for annual invoices covering the oldest month", () => {
    const now = new Date(Date.UTC(2026, 8, 24));
    const oldest = monthEnds(now)[0].at;
    expect(historyWindowStart(now)).toBe(Date.UTC(2024, 7, 1) / 1000);
    expect(historyWindowStart(now)).toBeLessThanOrEqual(oldest - 366 * DAY);
  });
});
