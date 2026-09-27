import { describe, expect, it } from "vitest";
import { AVERAGE_MONTH_DAYS } from "../../src/lib/revenue/money";
import { parseWhopKey } from "../../src/lib/revenue/whop/key";
import {
  billingMonths,
  paymentWindowStart,
  promoCodesToRead,
  untaxedAmount,
  whopMrr,
  whopServiceLines,
  type WhopMembership,
  type WhopPayment,
  type WhopPlan,
  type WhopPromo,
} from "../../src/lib/revenue/whop/mrr";

const DAY = 86_400;
const NOW = Date.UTC(2026, 8, 25) / 1000;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

const plans = new Map<string, WhopPlan>(
  [
    {
      id: "plan_m",
      plan_type: "renewal",
      renewal_price: 20,
      billing_period: 30,
      currency: "usd",
      tax_type: "exclusive",
    },
    {
      id: "plan_y",
      plan_type: "renewal",
      renewal_price: 120,
      billing_period: 365,
      currency: "eur",
      tax_type: "inclusive",
    },
    {
      id: "plan_once",
      plan_type: "one_time",
      renewal_price: 0,
      billing_period: null,
      currency: "usd",
      tax_type: "exclusive",
    },
    {
      id: "plan_free",
      plan_type: "renewal",
      renewal_price: 0,
      billing_period: 30,
      currency: "usd",
      tax_type: "exclusive",
    },
  ].map((plan) => [plan.id, plan]),
);

const membership = (overrides: Partial<WhopMembership> = {}): WhopMembership => ({
  id: "mem_1",
  status: "active",
  plan_id: "plan_m",
  user_id: "user_1",
  current_period_start: iso(NOW - 10 * DAY),
  ...overrides,
});

const money = (amount: string, currency = "usd") => ({ amount, currency });
const payment = (overrides: Partial<WhopPayment> = {}): WhopPayment => ({
  id: "pay_1",
  status: "paid",
  substatus: "succeeded",
  billing_reason: "subscription_cycle",
  membership_id: "mem_1",
  plan_id: "plan_m",
  promo_code_id: null,
  paid_at: iso(NOW - 10 * DAY),
  created_at: iso(NOW - 10 * DAY),
  total: money("22.00"),
  tax_amount: money("2.00"),
  ...overrides,
});

const promos = new Map<string, WhopPromo>([
  ["promo_20", { id: "promo_20", promo_type: "percentage", amount_off: 0.2, duration: "forever" }],
  ["promo_once", { id: "promo_once", promo_type: "percentage", amount_off: 0.5, duration: "once" }],
]);

const payments = [
  // mem_1 renewed: $20 without tax. Its first payment had a promo code that no longer matters.
  payment(),
  payment({
    id: "pay_0",
    billing_reason: "subscription_create",
    promo_code_id: "promo_20",
    paid_at: iso(NOW - 40 * DAY),
    total: money("16.00"),
    tax_amount: null,
  }),
  // mem_2 in its first period on the yearly plan, 20% off for good, 20% VAT included.
  payment({
    id: "pay_2",
    membership_id: "mem_2",
    plan_id: "plan_y",
    billing_reason: "subscription_create",
    promo_code_id: "promo_20",
    total: money("96.00", "eur"),
    tax_amount: money("16.00", "eur"),
  }),
  // mem_3 in its first period with a promo code for the first payment only.
  payment({
    id: "pay_3",
    membership_id: "mem_3",
    billing_reason: "subscription_create",
    promo_code_id: "promo_once",
    total: money("10.00"),
    tax_amount: null,
  }),
  // mem_9 renewed on another plan before it changed plans.
  payment({ id: "pay_9", membership_id: "mem_9", plan_id: "plan_y", total: money("50.00") }),
  payment({
    id: "pay_refunded",
    membership_id: "mem_3",
    substatus: "refunded",
    total: money("99.00"),
  }),
];

describe("Whop keys", () => {
  it("accepts keys it cannot tell from others by refusing only other providers' keys", () => {
    const key = "apik_AbCdEfGhIjKlMnOpQrSt_C0000_C_1234";
    expect(parseWhopKey(` ${key} `)).toEqual({ key, livemode: null, hint: "…1234" });
    expect(() => parseWhopKey("polar_oat_abcdefghijklmnopqrstuvwxyz")).toThrow(/another/);
    expect(() => parseWhopKey("short")).toThrow(/Whop API key/);
  });
});

describe("Whop MRR", () => {
  it("counts billing periods in days as months", () => {
    expect(billingMonths(30)).toBe(1);
    expect(billingMonths(90)).toBe(3);
    expect(billingMonths(365)).toBe(12);
    expect(billingMonths(7)).toBe(7 / AVERAGE_MONTH_DAYS);
  });

  it("takes tax out of a payment's total", () => {
    expect(untaxedAmount(payment())).toBeCloseTo(2000, 6);
    expect(untaxedAmount(payment({ tax_amount: null }))).toBeCloseTo(2200, 6);
  });

  it("values memberships by their latest renewal, or their plan and first payment", () => {
    const memberships = [
      membership(),
      membership({ id: "mem_2", status: "past_due", plan_id: "plan_y", user_id: "user_2" }),
      membership({ id: "mem_3" }),
      membership({ id: "mem_4", plan_id: "plan_once" }),
      membership({ id: "mem_5", plan_id: "plan_free", user_id: "user_5" }),
      membership({ id: "mem_6" }),
      membership({ id: "mem_7", status: "trialing" }),
      membership({ id: "mem_8", plan_id: "plan_y", user_id: "user_8" }),
      membership({ id: "mem_9", user_id: null }),
    ];
    const result = whopMrr(memberships, new Set(["mem_6"]), plans, payments, promos);
    // mem_1 $20, mem_3 $20 (the promo was for the first payment), mem_9 $20 on its new plan.
    expect(result.byCurrency.usd).toBeCloseTo(6000, 6);
    // EUR 120 less 20%, without the VAT included: EUR 80 a year.
    expect(result.byCurrency.eur).toBeCloseTo(8000 / 12, 6);
    expect(result.customers).toBe(3);
    expect(result.subscriptionIds).toEqual(["mem_1", "mem_2", "mem_3", "mem_5", "mem_8", "mem_9"]);
    expect(result.skippedItems).toBe(1);
  });

  it("reads the promo codes of memberships in their first period only", () => {
    const memberships = [
      membership(),
      membership({ id: "mem_2", plan_id: "plan_y" }),
      membership({ id: "mem_3" }),
    ];
    expect(promoCodesToRead(memberships, payments).sort()).toEqual(["promo_20", "promo_once"]);
    expect(promoCodesToRead([membership()], payments)).toEqual([]);
  });

  it("reads payments back one billing period before the current one", () => {
    const now = new Date(NOW * 1000);
    const start = paymentWindowStart([membership()], plans, now);
    expect(start).toBe(Math.floor(NOW - 10 * DAY - AVERAGE_MONTH_DAYS * DAY - 2 * DAY));
  });
});

describe("Whop history", () => {
  it("counts each paid subscription payment over one billing period from when it was paid", () => {
    const lines = whopServiceLines(
      [
        ...payments,
        payment({ id: "pay_update", billing_reason: "subscription_update" }),
        payment({ id: "pay_gone", plan_id: "plan_deleted" }),
      ],
      plans,
    );
    expect(lines.map((line) => [line.start, line.end - line.start, line.currency])).toEqual([
      [NOW - 10 * DAY, 30 * DAY, "usd"],
      [NOW - 40 * DAY, 30 * DAY, "usd"],
      [NOW - 10 * DAY, 365 * DAY, "eur"],
      [NOW - 10 * DAY, 30 * DAY, "usd"],
      [NOW - 10 * DAY, 365 * DAY, "usd"],
    ]);
    expect(lines[0].monthly).toBeCloseTo(2000, 6);
    expect(lines[2].monthly).toBeCloseTo(8000 / 12, 6);
  });
});
