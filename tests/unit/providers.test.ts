import { describe, expect, it } from "vitest";
import { isProviderId, providerName } from "../../src/lib/revenue/catalog";
import { parseDodoKey } from "../../src/lib/revenue/dodo/key";
import {
  dodoMrr,
  taxIncludedSubscriptions,
  untaxedShare,
  type DodoSubscription,
} from "../../src/lib/revenue/dodo/mrr";
import { intervalMonths } from "../../src/lib/revenue/money";
import { parsePaddleKey } from "../../src/lib/revenue/paddle/key";
import {
  paddleMrr,
  paddleServiceLines,
  transactionWindowStart,
  type PaddleSubscription,
  type PaddleTransaction,
} from "../../src/lib/revenue/paddle/mrr";
import { parsePolarToken } from "../../src/lib/revenue/polar/key";
import {
  meteredPrices,
  polarMrr,
  polarServiceLines,
  type PolarOrder,
  type PolarSubscription,
} from "../../src/lib/revenue/polar/mrr";

const NOW = Date.UTC(2026, 8, 25, 12) / 1000;
const DAY = 86_400;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

describe("provider catalog", () => {
  it("knows the four providers", () => {
    expect(["stripe", "paddle", "polar", "dodo"].every(isProviderId)).toBe(true);
    expect(isProviderId("lemonsqueezy")).toBe(false);
    expect(isProviderId("toString")).toBe(false);
    expect(providerName("dodo")).toBe("Dodo Payments");
    expect(providerName(null)).toBe("a payment provider");
  });
});

describe("keys", () => {
  const paddleLive = `pdl_live_apikey_${"a".repeat(26)}_${"B".repeat(22)}_c1d`;
  it("accepts Paddle keys with permissions and keeps a hint", () =>
    expect(parsePaddleKey(` ${paddleLive} `, { allowTest: false })).toEqual({
      key: paddleLive,
      livemode: true,
      hint: "pdl_live_apikey_…_c1d",
    }));
  it("refuses legacy Paddle keys, which have full access", () =>
    expect(() => parsePaddleKey("a".repeat(50), { allowTest: true })).toThrow(/legacy/));
  it("refuses Paddle sandbox keys unless allowed", () => {
    const sandbox = paddleLive.replace("pdl_live_", "pdl_sdbx_");
    expect(() => parsePaddleKey(sandbox, { allowTest: false })).toThrow(/Sandbox/);
    expect(parsePaddleKey(sandbox, { allowTest: true }).livemode).toBe(false);
  });
  it("accepts Polar organization tokens only", () => {
    const token = `polar_oat_${"x".repeat(43)}`;
    expect(parsePolarToken(token)).toEqual({ key: token, livemode: null, hint: "polar_oat_…xxxx" });
    expect(() => parsePolarToken(`polar_at_${"x".repeat(43)}`)).toThrow(/organization access/);
    expect(() => parsePolarToken("polar_oat_short")).toThrow();
  });
  it("refuses other providers' keys as Dodo keys", () => {
    expect(parseDodoKey("dodo_live_abcdefghijklmnop").hint).toBe("…mnop");
    expect(() => parseDodoKey(`rk_live_${"a".repeat(20)}`)).toThrow(/another payment provider/);
    expect(() => parseDodoKey("short")).toThrow();
  });
});

describe("intervals", () => {
  it("normalize every billing interval to months", () => {
    expect(intervalMonths("month", 3)).toBe(3);
    expect(intervalMonths("year")).toBe(12);
    expect(intervalMonths("week")).toBeCloseTo(7 / (365.25 / 12), 10);
  });
});

function paddleSubscription(overrides: Partial<PaddleSubscription> = {}): PaddleSubscription {
  return {
    id: "sub_1",
    status: "active",
    customer_id: "ctm_1",
    currency_code: "USD",
    billing_cycle: { interval: "month", frequency: 1 },
    current_billing_period: { starts_at: iso(NOW - 10 * DAY), ends_at: iso(NOW + 20 * DAY) },
    discount: null,
    ...overrides,
  };
}

function paddleTransaction(
  lines: PaddleTransaction["details"]["line_items"],
  overrides: Partial<PaddleTransaction> = {},
): PaddleTransaction {
  return {
    id: "txn_1",
    status: "completed",
    subscription_id: "sub_1",
    currency_code: "USD",
    billed_at: iso(NOW - 10 * DAY),
    billing_period: { starts_at: iso(NOW - 10 * DAY), ends_at: iso(NOW + 20 * DAY) },
    items: [
      {
        price: {
          id: "pri_1",
          billing_cycle: { interval: "month", frequency: 1 },
          unit_price: { amount: "1000", currency_code: "USD" },
        },
      },
      {
        price: {
          id: "pri_once",
          billing_cycle: null,
          unit_price: { amount: "500", currency_code: "USD" },
        },
      },
    ],
    details: { line_items: lines },
    ...overrides,
  };
}

const totals = (subtotal: number, discount: number, tax: number) => ({
  subtotal: String(subtotal),
  discount: String(discount),
  tax: String(tax),
  total: String(subtotal - discount + tax),
});
const line = (priceId: string, t: ReturnType<typeof totals>, rate: string | null = null) => ({
  price_id: priceId,
  proration: rate
    ? { rate, billing_period: { starts_at: iso(NOW - 5 * DAY), ends_at: iso(NOW + 10 * DAY) } }
    : null,
  totals: t,
});

describe("Paddle MRR", () => {
  it("counts the latest full-period recurring charge without tax, and skips one-off lines", () =>
    expect(
      paddleMrr(
        [paddleSubscription()],
        [
          paddleTransaction(
            [line("pri_1", totals(1000, 0, 250)), line("pri_once", totals(500, 0, 0))],
            {
              billed_at: iso(NOW - 40 * DAY),
              id: "txn_old",
            },
          ),
          paddleTransaction([line("pri_1", totals(2000, 0, 400))]),
          // A proration after the charge is not a full period and does not replace it.
          paddleTransaction([line("pri_1", totals(700, 0, 0), "0.5")], {
            billed_at: iso(NOW - DAY),
            id: "txn_proration",
          }),
        ],
        NOW,
      ),
    ).toEqual({
      byCurrency: { usd: 2000 },
      customers: 1,
      subscriptionIds: ["sub_1"],
      skippedItems: 0,
    }));

  it("keeps a discount that still applies and removes one that ended", () => {
    const charge = [paddleTransaction([line("pri_1", totals(1000, 200, 160))])];
    const ongoing = paddleSubscription({
      discount: { id: "dsc", starts_at: null, ends_at: iso(NOW + DAY), type: "recurring" },
    });
    expect(paddleMrr([ongoing], charge, NOW).byCurrency.usd).toBe(800);
    expect(paddleMrr([paddleSubscription()], charge, NOW).byCurrency.usd).toBe(1000);
    const oneOff = paddleSubscription({
      discount: { id: "dsc", starts_at: null, ends_at: null, type: "one-off" },
    });
    expect(paddleMrr([oneOff], charge, NOW).byCurrency.usd).toBe(1000);
  });

  it("normalizes the billing cycle and leaves out trials and paused subscriptions", () => {
    const quarterly = paddleSubscription({ billing_cycle: { interval: "month", frequency: 3 } });
    const result = paddleMrr(
      [
        quarterly,
        paddleSubscription({ id: "sub_2", status: "trialing" }),
        paddleSubscription({ id: "sub_3", status: "paused" }),
      ],
      [paddleTransaction([line("pri_1", totals(3000, 0, 0))])],
      NOW,
    );
    expect(result.byCurrency.usd).toBe(1000);
    expect(result.subscriptionIds).toEqual(["sub_1"]);
  });

  it("skips a subscription without a paid charge", () =>
    expect(paddleMrr([paddleSubscription()], [], NOW).skippedItems).toBe(1));

  it("reads far enough back for a past-due subscription's last paid period", () => {
    const pastDue = paddleSubscription({ status: "past_due" });
    expect(transactionWindowStart([pastDue], new Date(NOW * 1000))).toBeLessThan(NOW - 40 * DAY);
  });

  it("turns charges into history lines, prorations at the full period's rate", () => {
    const lines = paddleServiceLines([
      paddleTransaction([
        line("pri_1", totals(1000, 0, 200)),
        line("pri_1", totals(500, 0, 0), "0.5"),
      ]),
      paddleTransaction([line("pri_1", totals(9900, 0, 0))], { subscription_id: null }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].monthly).toBe(1000);
    expect(lines[1].monthly).toBe(1000);
    expect(lines[1].start).toBe(NOW - 5 * DAY);
  });
});

function polarSubscription(overrides: Partial<PolarSubscription> = {}): PolarSubscription {
  return {
    id: "ps_1",
    status: "active",
    amount: 1000,
    currency: "usd",
    recurring_interval: "month",
    recurring_interval_count: 1,
    current_period_start: iso(NOW - 10 * DAY),
    customer_id: "pc_1",
    discount: null,
    prices: [{ id: "price_fixed", amount_type: "fixed" }],
    ...overrides,
  };
}

function polarOrder(overrides: Partial<PolarOrder> = {}): PolarOrder {
  return {
    id: "ord_1",
    status: "paid",
    billing_reason: "subscription_cycle",
    subscription_id: "ps_1",
    currency: "usd",
    subtotal_amount: 1000,
    discount_amount: 0,
    net_amount: 1000,
    tax_amount: 0,
    total_amount: 1000,
    created_at: iso(NOW - 10 * DAY),
    items: [
      {
        amount: 1000,
        tax_amount: 0,
        proration: false,
        product_price_id: "price_fixed",
        start_timestamp: iso(NOW - 10 * DAY),
        end_timestamp: iso(NOW + 20 * DAY),
      },
    ],
    product: { recurring_interval: "month", recurring_interval_count: 1 },
    ...overrides,
  };
}

describe("Polar MRR", () => {
  it("adds back a fixed discount for the first period only", () => {
    const discounted = polarSubscription({
      amount: 700,
      discount: { type: "fixed", duration: "once", amounts: { usd: 300 } },
    });
    expect(polarMrr([discounted], []).byCurrency.usd).toBe(1000);
    const forever = polarSubscription({
      amount: 700,
      discount: { type: "fixed", duration: "forever", amounts: { usd: 300 } },
    });
    expect(polarMrr([forever], []).byCurrency.usd).toBe(700);
  });

  it("takes out included tax at the share the latest order shows", () => {
    const inclusive = polarOrder({
      subtotal_amount: 1200,
      net_amount: 1000,
      tax_amount: 200,
      total_amount: 1200,
    });
    const older = polarOrder({
      id: "ord_0",
      created_at: iso(NOW - 40 * DAY),
      net_amount: 1200,
      tax_amount: 0,
    });
    const result = polarMrr([polarSubscription({ amount: 1200 })], [older, inclusive]);
    expect(result.byCurrency.usd).toBe(1000);
  });

  it("leaves out trials and counts a yearly plan per month", () => {
    const result = polarMrr(
      [
        polarSubscription({ recurring_interval: "year", amount: 12000 }),
        polarSubscription({ id: "ps_2", status: "trialing" }),
      ],
      [],
    );
    expect(result.byCurrency.usd).toBe(1000);
    expect(result.subscriptionIds).toEqual(["ps_1"]);
  });

  it("turns orders into history lines without metered usage", () => {
    const metered = meteredPrices([
      polarSubscription({ prices: [{ id: "price_meter", amount_type: "metered_unit" }] }),
    ]);
    const order = polarOrder({
      subtotal_amount: 1500,
      discount_amount: 300,
      net_amount: 1200,
      total_amount: 1200,
      items: [
        {
          amount: 1000,
          tax_amount: 0,
          proration: false,
          product_price_id: "price_fixed",
          start_timestamp: iso(NOW - 10 * DAY),
          end_timestamp: iso(NOW + 20 * DAY),
        },
        {
          amount: 500,
          tax_amount: 0,
          proration: false,
          product_price_id: "price_meter",
          start_timestamp: iso(NOW - 40 * DAY),
          end_timestamp: iso(NOW - 10 * DAY),
        },
        // Older orders may lack a period: the order's date and the product's interval stand in.
        { amount: 1000, tax_amount: 0, proration: false, product_price_id: null },
      ],
    });
    const lines = polarServiceLines([order, polarOrder({ billing_reason: "purchase" })], metered);
    expect(lines.map((l) => l.monthly)).toEqual([800, 800]);
    expect(lines[1].start).toBe(NOW - 10 * DAY);
  });
});

function dodoSubscription(overrides: Partial<DodoSubscription> = {}): DodoSubscription {
  return {
    subscription_id: "sub_d1",
    status: "active",
    customer: { customer_id: "dc_1" },
    recurring_pre_tax_amount: 1000,
    currency: "USD",
    tax_inclusive: false,
    payment_frequency_interval: "Month",
    payment_frequency_count: 1,
    trial_period_days: 0,
    created_at: iso(NOW - 60 * DAY),
    on_demand: false,
    ...overrides,
  };
}

describe("Dodo Payments MRR", () => {
  it("counts the recurring charge per month and leaves out trials and on-demand", () => {
    const result = dodoMrr(
      [
        dodoSubscription({ payment_frequency_interval: "Week", recurring_pre_tax_amount: 700 }),
        dodoSubscription({
          subscription_id: "sub_trial",
          created_at: iso(NOW - DAY),
          trial_period_days: 7,
        }),
        dodoSubscription({ subscription_id: "sub_demand", on_demand: true }),
        dodoSubscription({ subscription_id: "sub_hold", status: "on_hold" }),
        // The same subscription listed twice across pages counts once.
        dodoSubscription({ payment_frequency_interval: "Week", recurring_pre_tax_amount: 700 }),
      ],
      new Map(),
      NOW,
    );
    expect(result.byCurrency.usd).toBeCloseTo(100 * (365.25 / 12), 6);
    expect(result.subscriptionIds).toEqual(["sub_d1"]);
  });

  it("takes out included tax from the latest payment, and skips without one", () => {
    const inclusive = [dodoSubscription({ tax_inclusive: true, recurring_pre_tax_amount: 1200 })];
    expect(taxIncludedSubscriptions(inclusive, NOW)).toEqual(["sub_d1"]);
    const share = untaxedShare({ payment_id: "p", total_amount: 1200, tax: 200 });
    expect(dodoMrr(inclusive, new Map([["sub_d1", share]]), NOW).byCurrency.usd).toBe(1000);
    expect(dodoMrr(inclusive, new Map(), NOW)).toMatchObject({ skippedItems: 1, customers: 0 });
  });
});
