import { describe, expect, it } from "vitest";
import {
  calculateMrr,
  intervalAmount,
  monthlyFactor,
  toUsdCents,
  type StripeCoupon,
  type StripeDiscount,
  type StripePrice,
  type StripeSubscription,
} from "../../src/lib/stripe/mrr";
import { parseRestrictedKey } from "../../src/lib/stripe/key";
import { decryptStripeKey, encryptStripeKey } from "../../src/lib/stripe/crypto";

const NOW = 1_800_000_000;

function price(overrides: Partial<StripePrice> = {}): StripePrice {
  return {
    id: "price_1",
    currency: "usd",
    unit_amount: 1000,
    unit_amount_decimal: "1000",
    billing_scheme: "per_unit",
    tiers_mode: null,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    transform_quantity: null,
    ...overrides,
  };
}

function subscription(overrides: Partial<StripeSubscription> = {}): StripeSubscription {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    currency: "usd",
    pause_collection: null,
    discounts: [],
    items: { data: [{ id: "si_1", price: price(), quantity: 1, discounts: [] }], has_more: false },
    ...overrides,
  };
}

function discount(coupon: StripeCoupon, overrides: Partial<StripeDiscount> = {}): StripeDiscount {
  return {
    id: `di_${coupon.id}`,
    start: NOW - 100,
    end: null,
    source: { type: "coupon", coupon },
    ...overrides,
  };
}

const coupon = (overrides: Partial<StripeCoupon>): StripeCoupon => ({
  id: "co_1",
  amount_off: null,
  currency: null,
  percent_off: null,
  duration: "forever",
  ...overrides,
});

const mrrOf = (subs: StripeSubscription[], coupons = new Map<string, StripeCoupon>()) =>
  calculateMrr(subs, coupons, NOW);

describe("monthly normalization", () => {
  it.each([
    [{ interval: "month", interval_count: 1 }, 1],
    [{ interval: "month", interval_count: 3 }, 1 / 3],
    [{ interval: "year", interval_count: 1 }, 1 / 12],
    [{ interval: "week", interval_count: 2 }, 52 / 12 / 2],
    [{ interval: "day", interval_count: 1 }, 365 / 12],
  ] as const)("%o", (recurring, factor) =>
    expect(monthlyFactor({ ...recurring, usage_type: "licensed" })).toBeCloseTo(factor, 10),
  );
});

describe("interval amounts", () => {
  it("multiplies per-unit prices by quantity and keeps fractional cents", () =>
    expect(intervalAmount(price({ unit_amount_decimal: "999.5" }), 3)).toBe(2998.5));
  const tiers = [
    {
      up_to: 10,
      unit_amount: 500,
      unit_amount_decimal: null,
      flat_amount: 0,
      flat_amount_decimal: null,
    },
    {
      up_to: null,
      unit_amount: 300,
      unit_amount_decimal: null,
      flat_amount: 1000,
      flat_amount_decimal: null,
    },
  ];
  it("prices every unit at the matching volume tier", () =>
    expect(
      intervalAmount(price({ billing_scheme: "tiered", tiers_mode: "volume", tiers }), 12),
    ).toBe(12 * 300 + 1000));
  it("prices graduated tiers per band", () =>
    expect(
      intervalAmount(price({ billing_scheme: "tiered", tiers_mode: "graduated", tiers }), 12),
    ).toBe(10 * 500 + 2 * 300 + 1000));
  it("refuses tiered prices without tiers", () =>
    expect(() =>
      intervalAmount(price({ billing_scheme: "tiered", tiers_mode: "volume" }), 1),
    ).toThrow());
});

describe("MRR", () => {
  it("normalizes annual plans and sums quantities", () => {
    const annual = price({
      unit_amount: 120000,
      unit_amount_decimal: "120000",
      recurring: { interval: "year", interval_count: 1, usage_type: "licensed" },
    });
    const result = mrrOf([
      subscription({
        items: { data: [{ id: "si", price: annual, quantity: 2 }], has_more: false },
      }),
    ]);
    expect(result.byCurrency).toEqual({ usd: 20000 });
    expect(result.customers).toBe(1);
  });

  it("counts active and past-due subscriptions only", () => {
    const result = mrrOf(
      ["active", "past_due", "trialing", "canceled", "unpaid", "incomplete", "paused"].map(
        (status, i) => subscription({ id: `sub_${i}`, customer: `cus_${i}`, status }),
      ),
    );
    expect(result.byCurrency).toEqual({ usd: 2000 });
    expect(result.subscriptionIds).toEqual(["sub_0", "sub_1"]);
  });

  it("excludes subscriptions with paused collection", () =>
    expect(mrrOf([subscription({ pause_collection: { behavior: "void" } })]).byCurrency).toEqual(
      {},
    ));

  it("skips metered items and reports them", () => {
    const metered = price({
      id: "price_m",
      recurring: { interval: "month", interval_count: 1, usage_type: "metered" },
    });
    const result = mrrOf([
      subscription({
        items: {
          data: [
            { id: "a", price: price() },
            { id: "b", price: metered },
          ],
          has_more: false,
        },
      }),
    ]);
    expect(result.byCurrency).toEqual({ usd: 1000 });
    expect(result.skippedItems).toBe(1);
  });

  it("applies percent and amount discounts, but not one-time ones", () => {
    const subs = [
      subscription({
        id: "a",
        customer: "c1",
        discounts: [discount(coupon({ id: "p", percent_off: 25 }))],
      }),
      subscription({
        id: "b",
        customer: "c2",
        discounts: [discount(coupon({ id: "m", amount_off: 300, currency: "usd" }))],
      }),
      subscription({
        id: "c",
        customer: "c3",
        discounts: [discount(coupon({ id: "o", percent_off: 100, duration: "once" }))],
      }),
    ];
    expect(mrrOf(subs).byCurrency).toEqual({ usd: 750 + 700 + 1000 });
  });

  it("ignores discounts that have not started or have ended", () => {
    const off = coupon({ percent_off: 50, duration: "repeating" });
    const subs = [
      subscription({ id: "a", discounts: [discount(off, { end: NOW - 1 })] }),
      subscription({ id: "b", customer: "c2", discounts: [discount(off, { start: NOW + 10 })] }),
    ];
    expect(mrrOf(subs).byCurrency).toEqual({ usd: 2000 });
  });

  it("resolves coupons fetched separately and applies item-level discounts", () => {
    const itemDiscount: StripeDiscount = {
      id: "di",
      start: NOW - 1,
      end: null,
      source: { type: "coupon", coupon: "half" },
    };
    const sub = subscription({
      items: { data: [{ id: "si", price: price(), discounts: [itemDiscount] }], has_more: false },
    });
    expect(
      mrrOf([sub], new Map([["half", coupon({ id: "half", percent_off: 50 })]])).byCurrency,
    ).toEqual({ usd: 500 });
    expect(() => mrrOf([sub])).toThrow(/half/);
  });

  it("never goes below zero and does not count free customers", () => {
    const result = mrrOf([
      subscription({ discounts: [discount(coupon({ amount_off: 5000, currency: "usd" }))] }),
    ]);
    expect(result.byCurrency).toEqual({});
    expect(result.customers).toBe(0);
    expect(result.subscriptionIds).toEqual(["sub_1"]);
  });

  it("keeps currencies apart and counts a customer once", () => {
    const eur = price({ currency: "eur" });
    const result = mrrOf([
      subscription({ id: "a" }),
      subscription({
        id: "b",
        currency: "eur",
        items: { data: [{ id: "si", price: eur }], has_more: false },
      }),
    ]);
    expect(result.byCurrency).toEqual({ usd: 1000, eur: 1000 });
    expect(result.customers).toBe(1);
  });
});

describe("USD conversion", () => {
  it("converts minor units with each currency's decimals", () =>
    expect(
      toUsdCents(
        { usd: 1000, eur: 876, jpy: 1500 },
        new Map([
          ["eur", 0.876],
          ["jpy", 150],
        ]),
      ),
    ).toBe(1000 + 1000 + 1000));
  it("fails instead of dropping a currency without a rate", () =>
    expect(() => toUsdCents({ sek: 100 }, new Map())).toThrow(/SEK/));
});

describe("restricted keys", () => {
  const live = "rk_live_" + "a1B2c3D4e5F6g7H8";
  it("accepts restricted live keys and keeps only a hint", () =>
    expect(parseRestrictedKey(` ${live} `, { allowTest: false })).toEqual({
      key: live,
      livemode: true,
      hint: "rk_live_…g7H8",
    }));
  it.each(["sk_live_abcdefghijklmnop", "pk_live_abcdefghijklmnop"])("rejects %s", (key) =>
    expect(() => parseRestrictedKey(key, { allowTest: true })).toThrow(/restricted key/),
  );
  it("rejects test keys unless allowed", () => {
    expect(() => parseRestrictedKey("rk_test_abcdefghijklmnop", { allowTest: false })).toThrow(
      /live-mode/,
    );
    expect(parseRestrictedKey("rk_test_abcdefghijklmnop", { allowTest: true }).livemode).toBe(
      false,
    );
  });
  it("rejects malformed input", () =>
    expect(() => parseRestrictedKey("rk_live_short", { allowTest: true })).toThrow());
});

describe("stored key encryption", () => {
  const secret = Buffer.alloc(32, 7).toString("base64");
  const saasId = "c0000000-0000-4000-8000-000000000001";
  it("round-trips and never stores the plaintext", () => {
    const stored = encryptStripeKey("rk_live_secretvalue123", saasId, secret);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("secretvalue");
    expect(decryptStripeKey(stored, saasId, secret)).toBe("rk_live_secretvalue123");
  });
  it("only decrypts for the SaaS it was stored for", () => {
    const stored = encryptStripeKey("rk_live_secretvalue123", saasId, secret);
    expect(() =>
      decryptStripeKey(stored, "c0000000-0000-4000-8000-000000000002", secret),
    ).toThrow();
  });
  it("detects tampering", () => {
    const [v, iv, data, tag] = encryptStripeKey("rk_live_secretvalue123", saasId, secret).split(
      ":",
    );
    const flipped = data.slice(0, -2) + (data.at(-2) === "A" ? "B" : "A") + data.at(-1);
    expect(() => decryptStripeKey([v, iv, flipped, tag].join(":"), saasId, secret)).toThrow();
  });
  it("requires a 32-byte key", () =>
    expect(() => encryptStripeKey("x", saasId, Buffer.alloc(16).toString("base64"))).toThrow(
      /not configured/,
    ));
});
