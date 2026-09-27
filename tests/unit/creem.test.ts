import { describe, expect, it } from "vitest";
import { parseCreemKey } from "../../src/lib/revenue/creem/key";
import {
  creemMrr,
  creemServiceLines,
  cycleMonths,
  untaxedAmount,
  type CreemProduct,
  type CreemSubscription,
  type CreemTransaction,
} from "../../src/lib/revenue/creem/mrr";
import { AVERAGE_MONTH_DAYS } from "../../src/lib/revenue/money";

const product = (overrides: Partial<CreemProduct> = {}): CreemProduct => ({
  id: "prod_monthly",
  price: 2000,
  currency: "USD",
  billing_type: "recurring",
  billing_period: "every-month",
  recurring_interval: "month",
  recurring_interval_count: 1,
  tax_mode: "exclusive",
  ...overrides,
});
const yearly = product({
  id: "prod_yearly",
  price: 12000,
  currency: "EUR",
  billing_period: "every-year",
  recurring_interval: null,
  recurring_interval_count: null,
  tax_mode: "inclusive",
});
const metered = product({ id: "prod_metered", price: 1000, usage_prices: [{ id: "price_usage" }] });

const transaction = (overrides: Partial<CreemTransaction> = {}): CreemTransaction => ({
  id: "tran_1",
  amount: 2000,
  amount_paid: 2000,
  discount_amount: 0,
  tax_amount: 0,
  currency: "USD",
  type: "invoice",
  status: "paid",
  subscription: "sub_1",
  period_start: Date.UTC(2026, 0, 1),
  period_end: Date.UTC(2026, 1, 1),
  created_at: Date.UTC(2026, 0, 1),
  ...overrides,
});

const subscription = (overrides: Partial<CreemSubscription> = {}): CreemSubscription => ({
  id: "sub_1",
  status: "active",
  product: product(),
  customer: { id: "cust_1" },
  items: [],
  discount: null,
  last_transaction: null,
  ...overrides,
});

describe("Creem keys", () => {
  it("accepts live keys and test keys where allowed", () => {
    const live = "creem_AbCdEf123456789";
    expect(parseCreemKey(` ${live} `, { allowTest: false })).toEqual({
      key: live,
      livemode: true,
      hint: "creem_…6789",
    });
    const test = "creem_test_AbCdEf123456789";
    expect(() => parseCreemKey(test, { allowTest: false })).toThrow(/Test keys/);
    expect(parseCreemKey(test, { allowTest: true })).toMatchObject({
      livemode: false,
      hint: "creem_test_…6789",
    });
    expect(() => parseCreemKey("rk_live_abcdefghijkl", { allowTest: true })).toThrow(/creem_/);
  });
});

describe("Creem MRR", () => {
  it("reads billing cycles", () => {
    expect(cycleMonths(product())).toBe(1);
    expect(cycleMonths(yearly)).toBe(12);
    expect(
      cycleMonths(product({ recurring_interval: null, billing_period: "every-three-months" })),
    ).toBe(3);
    expect(cycleMonths(product({ recurring_interval: "week", recurring_interval_count: 2 }))).toBe(
      14 / AVERAGE_MONTH_DAYS,
    );
    expect(cycleMonths(product({ recurring_interval: null, billing_period: "custom" }))).toBeNull();
    expect(cycleMonths(product({ billing_type: "onetime" }))).toBeNull();
  });

  it("takes discounts and tax out of a transaction", () => {
    expect(untaxedAmount(transaction({ amount: 1000, amount_paid: 1210, tax_amount: 210 }))).toBe(
      1000,
    );
    expect(
      untaxedAmount(transaction({ amount: 1000, amount_paid: null, discount_amount: 100 })),
    ).toBe(900);
  });

  it("values subscriptions by price, units and lasting discounts, without included tax", () => {
    const products = new Map([["prod_yearly", yearly]]);
    const result = creemMrr(
      [
        // Two seats at 25% off for good: $30.
        subscription({
          items: [{ product_id: "prod_monthly", units: 2 }],
          discount: { type: "percentage", amount: 25, duration: "forever" },
        }),
        // EUR 120 a year with 20% VAT included and a first-period discount: EUR 100 a year.
        subscription({
          id: "sub_2",
          status: "past_due",
          product: "prod_yearly",
          customer: "cust_2",
          discount: { type: "percentage", amount: 50, duration: "once" },
          last_transaction: transaction({
            subscription: null,
            amount: 6000,
            amount_paid: 6000,
            tax_amount: 1000,
            currency: "EUR",
          }),
        }),
        // Usage is not part of the price: $10.
        subscription({ id: "sub_3", status: "scheduled_cancel", product: metered }),
        subscription({ id: "sub_4", status: "trialing" }),
        // Tax-inclusive without a transaction to read.
        subscription({ id: "sub_5", product: yearly, customer: { id: "cust_5" } }),
        subscription({ id: "sub_6", status: "canceled" }),
        // $5 off for some months: $15.
        subscription({
          id: "sub_7",
          customer: "cust_7",
          discount: { type: "fixed", amount: 500, duration: "repeating" },
        }),
      ],
      products,
    );
    expect(result.byCurrency.usd).toBe(3000 + 1000 + 1500);
    expect(result.byCurrency.eur).toBeCloseTo(10000 / 12, 6);
    expect(result.customers).toBe(3);
    expect(result.subscriptionIds).toEqual(["sub_1", "sub_2", "sub_3", "sub_5", "sub_7"]);
    expect(result.skippedItems).toBe(1);
  });

  it("finds the tax share in the transactions read when a subscription has none", () => {
    const result = creemMrr([subscription({ product: yearly })], new Map(), [
      transaction({ amount_paid: 12000, tax_amount: 3000, currency: "EUR", created_at: 1 }),
      transaction({ amount_paid: 12000, tax_amount: 2000, currency: "EUR", created_at: 2 }),
      transaction({ status: "refunded", amount_paid: 12000, tax_amount: 0, created_at: 3 }),
    ]);
    expect(result.byCurrency.eur).toBeCloseTo(10000 / 12, 6);
    expect(result.skippedItems).toBe(0);
  });
});

describe("Creem history", () => {
  it("counts paid subscription transactions over their periods", () => {
    const subscriptions = [
      subscription(),
      subscription({ id: "sub_3", product: metered }),
      subscription({ id: "sub_2", product: yearly }),
    ];
    const lines = creemServiceLines(
      [
        // Milliseconds, a calendar month: $20 a month.
        transaction(),
        transaction({ id: "tran_once", type: "payment", subscription: null }),
        transaction({ id: "tran_refunded", status: "refunded" }),
        transaction({ id: "tran_metered", subscription: "sub_3" }),
        // Seconds, a year, partly refunded: EUR 100 a year without tax.
        transaction({
          id: "tran_yearly",
          subscription: "sub_2",
          status: "partialRefund",
          currency: "EUR",
          amount_paid: 12000,
          tax_amount: 2000,
          period_start: Date.UTC(2026, 2, 15) / 1000,
          period_end: Date.UTC(2027, 2, 15) / 1000,
        }),
      ],
      subscriptions,
      new Map(),
    );
    expect(lines).toEqual([
      {
        start: Date.UTC(2026, 0, 1) / 1000,
        end: Date.UTC(2026, 1, 1) / 1000,
        currency: "usd",
        monthly: 2000,
      },
      {
        start: Date.UTC(2026, 2, 15) / 1000,
        end: Date.UTC(2027, 2, 15) / 1000,
        currency: "eur",
        monthly: 10000 / 12,
      },
    ]);
  });
});
