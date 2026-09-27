import { describe, expect, it } from "vitest";
import { splitAccountKey } from "../../src/lib/revenue/account-key";
import { parseChargebeeKey, parseChargebeeSite } from "../../src/lib/revenue/chargebee/key";
import {
  chargebeeMrr,
  chargebeeServiceLines,
  invoiceWindowStart,
  type ChargebeeInvoice,
  type ChargebeeLineItem,
  type ChargebeeSubscription,
} from "../../src/lib/revenue/chargebee/mrr";
import { historyWindowStart } from "../../src/lib/revenue/history";
import { AVERAGE_MONTH_DAYS } from "../../src/lib/revenue/money";

const at = (year: number, month: number, day = 1) => Date.UTC(year, month, day) / 1000;

const subscription = (overrides: Partial<ChargebeeSubscription> = {}): ChargebeeSubscription => ({
  id: "sub_a",
  status: "active",
  customer_id: "cus_a",
  currency_code: "USD",
  billing_period: 1,
  billing_period_unit: "month",
  current_term_start: at(2026, 8),
  coupons: [{ coupon_id: "LOYAL" }],
  discounts: [],
  ...overrides,
});

const line = (overrides: Partial<ChargebeeLineItem> = {}): ChargebeeLineItem => ({
  id: "li_plan",
  subscription_id: "sub_a",
  date_from: at(2026, 7),
  date_to: at(2026, 8),
  amount: 5000,
  discount_amount: 0,
  tax_amount: 0,
  entity_type: "plan_item_price",
  metered: false,
  ...overrides,
});

const invoice = (overrides: Partial<ChargebeeInvoice> = {}): ChargebeeInvoice => ({
  id: "inv_1",
  status: "paid",
  price_type: "tax_exclusive",
  currency_code: "USD",
  date: at(2026, 7),
  line_items: [],
  line_item_discounts: [],
  ...overrides,
});

// sub_a, monthly: August, then September with a welcome coupon that has ended since and credits.
const august = invoice({
  line_items: [
    line(),
    line({ id: "li_addon", entity_type: "addon_item_price", amount: 1000 }),
    line({ id: "li_setup", entity_type: "charge_item_price", amount: 3000 }),
    line({ id: "li_usage", entity_type: "addon_item_price", amount: 700, metered: true }),
  ],
  line_item_discounts: [
    {
      line_item_id: "li_plan",
      discount_type: "item_level_coupon",
      coupon_id: "LOYAL",
      entity_id: "LOYAL",
      discount_amount: 500,
    },
  ],
});
const september = invoice({
  id: "inv_2",
  date: at(2026, 8),
  line_items: [
    line({ id: "li_plan_9", date_from: at(2026, 8), date_to: at(2026, 9) }),
    line({
      id: "li_addon_9",
      entity_type: "addon_item_price",
      amount: 1000,
      date_from: at(2026, 8),
      date_to: at(2026, 9),
    }),
  ],
  line_item_discounts: [
    {
      line_item_id: "li_plan_9",
      discount_type: "item_level_coupon",
      entity_id: "LOYAL",
      discount_amount: 500,
    },
    {
      line_item_id: "li_plan_9",
      discount_type: "document_level_coupon",
      entity_id: "WELCOME",
      discount_amount: 1000,
    },
    {
      line_item_id: "li_plan_9",
      discount_type: "promotional_credits",
      entity_id: null,
      discount_amount: 200,
    },
  ],
});
// sub_b, yearly in EUR at EUR 120 with EUR 20 of tax included.
const yearly = invoice({
  id: "inv_3",
  price_type: "tax_inclusive",
  currency_code: "EUR",
  date: at(2026, 2, 15),
  line_items: [
    line({
      id: "li_yearly",
      subscription_id: "sub_b",
      date_from: at(2026, 2, 15),
      date_to: at(2027, 2, 15),
      amount: 12000,
      tax_amount: 2000,
    }),
  ],
});
// sub_e, monthly: a full August, then a prorated upgrade from mid-September.
const upgrade = invoice({
  id: "inv_4",
  date: at(2026, 8, 15),
  line_items: [
    line({
      id: "li_upgrade",
      subscription_id: "sub_e",
      date_from: at(2026, 8, 15),
      date_to: at(2026, 9),
      amount: 2500,
    }),
  ],
});
const augustE = invoice({
  id: "inv_5",
  line_items: [line({ id: "li_e", subscription_id: "sub_e", amount: 5000 })],
});

describe("Chargebee keys", () => {
  it("reads the site from a name or an address", () => {
    expect(parseChargebeeSite("https://acme-test.chargebee.com/d/subscriptions")).toBe("acme-test");
    expect(parseChargebeeSite(" Acme.chargebee.com ")).toBe("acme");
    expect(() => parseChargebeeSite("not a site!")).toThrow(/Chargebee site/);
  });

  it("stores the site with the key, and refuses test sites unless allowed", () => {
    const key = "live_AbCdEfGhIjKlMnOp1234";
    const parsed = parseChargebeeKey({ key, account: "acme" }, { allowTest: false });
    expect(parsed).toEqual({ key: `acme:${key}`, livemode: true, hint: "acme · …1234" });
    expect(splitAccountKey(parsed.key)).toEqual({ account: "acme", key });
    expect(() => parseChargebeeKey({ key, account: "acme-test" }, { allowTest: false })).toThrow(
      /Test sites/,
    );
    expect(parseChargebeeKey({ key, account: "acme-test" }, { allowTest: true }).livemode).toBe(
      false,
    );
    expect(() =>
      parseChargebeeKey({ key: "rk_live_abcdefghijklmnop", account: "acme" }, { allowTest: true }),
    ).toThrow(/another payment provider/);
    expect(
      parseChargebeeKey({ key, account: "a".repeat(60) }, { allowTest: true }).hint.length,
    ).toBeLessThanOrEqual(40);
  });
});

describe("Chargebee MRR", () => {
  it("values each subscription by its latest full invoice, with the discounts it still has", () => {
    const result = chargebeeMrr(
      [
        subscription(),
        subscription({
          id: "sub_b",
          status: "non_renewing",
          customer_id: "cus_b",
          currency_code: "EUR",
          billing_period_unit: "year",
          coupons: [],
        }),
        subscription({ id: "sub_c", customer_id: "cus_c" }),
        subscription({ id: "sub_d", status: "in_trial" }),
        subscription({ id: "sub_e", coupons: [] }),
        subscription({ id: "sub_f", status: "paused" }),
      ],
      [august, september, yearly, upgrade, augustE],
    );
    // sub_a: September's plan after LOYAL, without the ended WELCOME coupon and the credits, and
    // its addon: $55. sub_e: August, since September's charge is prorated: $50.
    expect(result.byCurrency.usd).toBe(5500 + 5000);
    expect(result.byCurrency.eur).toBeCloseTo(10000 / 12, 6);
    expect(result.customers).toBe(2);
    expect(result.subscriptionIds).toEqual(["sub_a", "sub_b", "sub_c", "sub_e"]);
    expect(result.skippedItems).toBe(1);
  });

  it("reads invoices back to the full charge each subscription needs", () => {
    const now = new Date(Date.UTC(2026, 8, 20));
    const start = invoiceWindowStart([subscription()], now);
    expect(start).toBe(Math.floor(at(2026, 8) - AVERAGE_MONTH_DAYS * 86_400 - 2 * 86_400));
    expect(invoiceWindowStart([subscription({ current_term_start: 0 })], now)).toBe(
      historyWindowStart(now),
    );
  });
});

describe("Chargebee history", () => {
  it("counts plan and addon lines over their periods, prorations at their full rate", () => {
    const lines = chargebeeServiceLines([august, september, yearly, upgrade]);
    const monthly = Object.fromEntries(
      lines.map((l) => [`${l.currency}:${l.start}:${l.monthly.toFixed(2)}`, true]),
    );
    expect(lines).toHaveLength(6);
    expect(monthly[`usd:${at(2026, 7)}:4500.00`]).toBe(true);
    expect(monthly[`usd:${at(2026, 7)}:1000.00`]).toBe(true);
    // Both coupons were charged in September; credits are not discounts.
    expect(monthly[`usd:${at(2026, 8)}:3500.00`]).toBe(true);
    expect(monthly[`eur:${at(2026, 2, 15)}:833.33`]).toBe(true);
    const prorated = lines.find((l) => l.start === at(2026, 8, 15))!;
    expect(prorated.monthly).toBeCloseTo(2500 / (16 / AVERAGE_MONTH_DAYS), 6);
  });
});
