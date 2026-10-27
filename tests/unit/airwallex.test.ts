import { describe, expect, it } from "vitest";
import { splitAccountKey } from "../../src/lib/revenue/account-key";
import { parseAirwallexKey } from "../../src/lib/revenue/airwallex/key";
import {
  airwallexMrr,
  airwallexSeconds,
  airwallexServiceLines,
  countsNow,
  ongoingDiscount,
  priceCharge,
  subscriptionInvoices,
  type AirwallexDiscount,
  type AirwallexInvoice,
  type AirwallexLineItem,
  type AirwallexPrice,
  type AirwallexSubscription,
  type AirwallexSubscriptionItem,
} from "../../src/lib/revenue/airwallex/mrr";
import {
  airwallexPayments,
  type AirwallexPaymentIntent,
  type AirwallexRefund,
} from "../../src/lib/revenue/airwallex/payments";
import { mrrAt } from "../../src/lib/revenue/history";

const DAY = 86_400;
const at = (year: number, month: number, day = 1) => Date.UTC(year, month, day) / 1000;
const NOW = at(2026, 9, 24) + 12 * 3_600;
// Airwallex Billing writes its offset without a colon.
const time = (seconds: number) =>
  new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "+0000");

const price = (overrides: Partial<AirwallexPrice> = {}): AirwallexPrice => ({
  id: "pri_monthly",
  currency: "USD",
  pricing_model: "FLAT",
  flat_amount: 29,
  metered: false,
  type: "RECURRING",
  tax_included: false,
  recurring: { period: 1, period_unit: "MONTH" },
  ...overrides,
});

const subscription = (
  id: string,
  overrides: Partial<AirwallexSubscription> = {},
): AirwallexSubscription => ({
  id,
  status: "ACTIVE",
  currency: "USD",
  billing_customer_id: `bcus_${id}`,
  collection_method: "AUTO_CHARGE",
  current_period_ends_at: time(NOW + 10 * DAY),
  recurring: { period: 1, period_unit: "MONTH" },
  applied_discounts: [],
  ...overrides,
});

const item = (
  subscriptionId: string,
  overrides: Partial<AirwallexSubscriptionItem> = {},
): AirwallexSubscriptionItem => ({
  id: `sit_${subscriptionId}`,
  subscription_id: subscriptionId,
  quantity: 1,
  price: price(),
  applied_discounts: [],
  ...overrides,
});

describe("Airwallex credentials", () => {
  const clientId = "Q3xTnV7sRkKq2LmPa9bC1d";
  const key = "4f0b5c2e9a7d41c3b8e6f1a2d3c4b5a6e7f8091a2b3c4d5e6f708192a3b4c5d6";

  it("keeps the Client ID and the key together, with a hint of each", () => {
    const parsed = parseAirwallexKey({ key: ` ${key} `, account: ` ${clientId} ` });
    expect(parsed).toEqual({
      key: `${clientId}:${key}`,
      livemode: null,
      hint: "Q3xTnV7s… · …c5d6",
    });
    expect(splitAccountKey(parsed.key)).toEqual({ account: clientId, key });
  });

  it("refuses a missing Client ID, another provider's key and the Client ID twice", () => {
    expect(() => parseAirwallexKey({ key, account: "" })).toThrow(/Client ID/);
    expect(() =>
      parseAirwallexKey({ key: `rk_live_${"a".repeat(24)}`, account: clientId }),
    ).toThrow(/another payment provider/);
    expect(() => parseAirwallexKey({ key: "short", account: clientId })).toThrow(/scoped API key/);
    expect(() => parseAirwallexKey({ key: clientId, account: clientId })).toThrow(
      /Client ID again/,
    );
  });
});

describe("Airwallex times", () => {
  it("reads offsets with and without a colon", () => {
    expect(airwallexSeconds("2026-10-24T12:00:00+0000")).toBe(NOW);
    expect(airwallexSeconds("2026-10-24T14:00:00+02:00")).toBe(NOW);
    expect(airwallexSeconds("null")).toBeNull();
    expect(airwallexSeconds(undefined)).toBeNull();
  });
});

describe("Airwallex prices", () => {
  it("charge flat, per unit with lots, by volume and graduated", () => {
    expect(priceCharge(price(), 3)).toBe(29);
    expect(
      priceCharge(price({ pricing_model: "PER_UNIT", unit_amount: 50, lot: { size: 5 } }), 12),
    ).toBe(150);
    expect(priceCharge(price({ pricing_model: "PER_UNIT", unit_amount: 2.5 }), 4)).toBe(10);
    const tiers = [
      { level: 1, unit_amount: 1, upper_bound: 50 },
      { level: 2, unit_amount: 0.5 },
    ];
    expect(priceCharge(price({ pricing_model: "VOLUME", tiers }), 100)).toBe(50);
    expect(priceCharge(price({ pricing_model: "VOLUME", tiers }), 40)).toBe(40);
    // Airwallex's own example: 50 units at $1, then 50 at $0.50.
    expect(priceCharge(price({ pricing_model: "GRADUATED", tiers }), 100)).toBe(75);
    expect(
      priceCharge(price({ pricing_model: "GRADUATED", tiers: [...tiers].reverse() }), 30),
    ).toBe(30);
    expect(priceCharge(price({ pricing_model: "TIERED_SOMETHING" }), 1)).toBeNull();
  });
});

describe("Airwallex discounts", () => {
  const discount = (overrides: Partial<AirwallexDiscount>): AirwallexDiscount => ({
    discount_model: "PERCENTAGE",
    percentage_off: 20,
    starts_at: time(NOW - 30 * DAY),
    ...overrides,
  });

  it("count while they last beyond the next charge", () => {
    expect(ongoingDiscount(discount({ duration_type: "INDEFINITELY" }), NOW)).toBe(true);
    expect(ongoingDiscount(discount({ duration_type: "ONCE" }), NOW)).toBe(false);
    expect(
      ongoingDiscount(discount({ duration_type: "CUSTOM", ends_at: time(NOW + DAY) }), NOW),
    ).toBe(true);
    expect(
      ongoingDiscount(discount({ duration_type: "CUSTOM", ends_at: time(NOW - DAY) }), NOW),
    ).toBe(false);
    expect(
      ongoingDiscount(
        discount({ duration_type: "CUSTOM", duration: { period: 3, period_unit: "MONTH" } }),
        NOW,
      ),
    ).toBe(true);
    expect(
      ongoingDiscount(
        discount({ duration_type: "INDEFINITELY", starts_at: time(NOW + 5 * DAY) }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("Airwallex MRR", () => {
  it("values active and unpaid subscriptions by their items, after lasting discounts", () => {
    const subscriptions = [
      subscription("sub_monthly"),
      subscription("sub_yearly", {
        recurring: { period: 1, period_unit: "YEAR" },
        applied_discounts: [
          {
            applied_to: "SUBSCRIPTION",
            discount_model: "PERCENTAGE",
            percentage_off: 50,
            duration_type: "INDEFINITELY",
          },
        ],
      }),
      subscription("sub_unpaid", { status: "UNPAID", currency: "EUR" }),
      subscription("sub_unpaid_ended", {
        status: "UNPAID",
        current_period_ends_at: time(NOW - DAY),
      }),
      subscription("sub_trial", { status: "IN_TRIAL" }),
      subscription("sub_outside", { collection_method: "OUT_OF_BAND" }),
      subscription("sub_quarterly", {
        billing_customer_id: "bcus_sub_monthly",
        recurring: { period: 3, period_unit: "MONTH" },
        applied_discounts: [
          { discount_model: "FLAT", amount_off: 6, currency: "USD", duration_type: "INDEFINITELY" },
          { discount_model: "PERCENTAGE", percentage_off: 90, duration_type: "ONCE" },
        ],
      }),
      subscription("sub_yen", { currency: "JPY" }),
      subscription("sub_taxed"),
    ];
    const items = new Map<string, AirwallexSubscriptionItem[]>([
      [
        "sub_monthly",
        [
          item("sub_monthly"),
          item("sub_monthly", {
            id: "sit_metered",
            price: price({ pricing_model: "PER_UNIT", unit_amount: 0.01, metered: true }),
          }),
          item("sub_monthly", { id: "sit_setup", price: price({ type: "ONE_OFF" }) }),
        ],
      ],
      [
        "sub_yearly",
        [
          item("sub_yearly", {
            price: price({ flat_amount: 600, recurring: { period_unit: "YEAR" } }),
          }),
        ],
      ],
      ["sub_unpaid", [item("sub_unpaid", { price: price({ currency: "EUR", flat_amount: 40 }) })]],
      [
        "sub_quarterly",
        [
          item("sub_quarterly", {
            quantity: 3,
            price: price({
              pricing_model: "PER_UNIT",
              unit_amount: 10,
              recurring: { period: 3, period_unit: "MONTH" },
            }),
          }),
        ],
      ],
      [
        "sub_yen",
        [
          item("sub_yen", {
            price: price({ currency: "JPY", flat_amount: 3000 }),
            applied_discounts: [
              {
                applied_to: "SUBSCRIPTION_ITEM",
                discount_model: "FLAT",
                amount_off: 1000,
                currency: "JPY",
                duration_type: "INDEFINITELY",
              },
            ],
          }),
        ],
      ],
      [
        "sub_taxed",
        [
          item("sub_taxed", {
            tax_percent: 10,
            price: price({ flat_amount: 11, tax_included: true }),
          }),
        ],
      ],
    ]);
    const result = airwallexMrr(subscriptions, items, NOW);
    // $29 + $600 a year at half ($25) + (3 x $10 - $6) a quarter ($8) + $11 with 10% tax ($10).
    expect(result.byCurrency.usd).toBeCloseTo(7200, 6);
    expect(result.byCurrency.eur).toBeCloseTo(4000, 6);
    expect(result.byCurrency.jpy).toBeCloseTo(2000, 6);
    // The quarterly subscription belongs to the monthly one's customer.
    expect(result.customers).toBe(5);
    expect(result.subscriptionIds).toEqual([
      "sub_monthly",
      "sub_yearly",
      "sub_unpaid",
      "sub_quarterly",
      "sub_yen",
      "sub_taxed",
    ]);
    // The metered item, and the subscription paid outside Airwallex.
    expect(result.skippedItems).toBe(2);
    expect(result.mrrNote).toBeNull();
  });

  it("counts unpaid subscriptions only until their period ends", () => {
    expect(countsNow(subscription("a", { status: "UNPAID" }), NOW)).toBe(true);
    expect(
      countsNow(subscription("a", { status: "UNPAID", current_period_ends_at: null }), NOW),
    ).toBe(false);
    expect(countsNow(subscription("a", { status: "PENDING" }), NOW)).toBe(false);
    expect(countsNow(subscription("a", { status: "CANCELLED" }), NOW)).toBe(false);
  });

  it("skips items without a price, in another currency or without a period", () => {
    const result = airwallexMrr(
      [subscription("sub_a", { recurring: null })],
      new Map([
        [
          "sub_a",
          [
            item("sub_a", { price: null, rate_card_version: { version: 1 } }),
            item("sub_a", { id: "sit_eur", price: price({ currency: "EUR" }) }),
            item("sub_a", { id: "sit_none", price: price({ recurring: null }) }),
          ],
        ],
      ]),
      NOW,
    );
    expect(result).toMatchObject({ byCurrency: {}, customers: 0, skippedItems: 3 });
    expect(result.subscriptionIds).toEqual(["sub_a"]);
  });

  it("says why MRR is zero for an account without Billing subscriptions", () => {
    const result = airwallexMrr([], new Map(), NOW);
    expect(result.byCurrency).toEqual({});
    expect(result.mrrNote).toMatch(/no active subscriptions in Airwallex Billing/);
  });
});

describe("Airwallex history", () => {
  const line = (overrides: Partial<AirwallexLineItem> = {}): AirwallexLineItem => ({
    id: "iit_1",
    invoice_id: "inv_1",
    amount: 29,
    currency: "USD",
    discount_amounts: [],
    tax_amount: 0,
    period_starts_at: time(at(2026, 7, 1)),
    period_ends_at: time(at(2026, 8, 1)),
    price: price(),
    ...overrides,
  });

  it("counts recurring lines after discounts and included tax over their periods", () => {
    const lines = airwallexServiceLines([
      line(),
      line({
        id: "iit_prorated",
        amount: 50,
        discount_amounts: [{ amount: 10 }],
        period_starts_at: time(at(2026, 7, 16)),
        period_ends_at: time(at(2026, 8, 1)),
      }),
      line({ id: "iit_taxed", amount: 11, tax_amount: 1, price: price({ tax_included: true }) }),
      line({ id: "iit_setup", price: price({ type: "ONE_OFF" }) }),
      line({ id: "iit_usage", price: price({ metered: true }) }),
      line({ id: "iit_rate", rate_card_item: { id: "rci_1" } }),
      line({ id: "iit_free", amount: 0 }),
    ]);
    expect(lines).toHaveLength(3);
    // $29 + $10, and $40 for 16 days at the rate of a whole month.
    expect(mrrAt(lines, at(2026, 7, 20)).usd).toBeCloseTo(
      2900 + 1000 + 4000 / (16 / (365.25 / 12)),
      6,
    );
    expect(mrrAt(lines, at(2026, 7, 10))).toEqual({ usd: 3900 });
    expect(mrrAt(lines, at(2026, 8, 1))).toEqual({});
  });

  it("reads only invoices that paid a subscription through Airwallex", () => {
    const invoice = (id: string, overrides: Partial<AirwallexInvoice> = {}): AirwallexInvoice => ({
      id,
      status: "FINALIZED",
      payment_status: "PAID",
      currency: "USD",
      subscription_id: "sub_1",
      paid_out_of_band: false,
      ...overrides,
    });
    const kept = subscriptionInvoices([
      invoice("inv_paid"),
      invoice("inv_oneoff", { subscription_id: null }),
      invoice("inv_unpaid", { payment_status: "UNPAID" }),
      invoice("inv_void", { status: "VOIDED" }),
      invoice("inv_outside", { paid_out_of_band: true }),
    ]);
    expect(kept.map((i) => i.id)).toEqual(["inv_paid"]);
  });
});

describe("Airwallex payments", () => {
  const intent = (
    id: string,
    overrides: Partial<AirwallexPaymentIntent> = {},
  ): AirwallexPaymentIntent => ({
    id,
    status: "SUCCEEDED",
    amount: 30,
    captured_amount: 30,
    currency: "USD",
    created_at: "2026-10-20T10:00:00+00:00",
    ...overrides,
  });
  const invoices = new Map<string, AirwallexInvoice>([
    [
      "inv_sub",
      {
        id: "inv_sub",
        currency: "USD",
        subscription_id: "sub_1",
        total_amount: 33,
        total_tax_amount: 3,
      },
    ],
    ["inv_oneoff", { id: "inv_oneoff", currency: "USD", total_amount: 30, total_tax_amount: 0 }],
  ]);

  it("value succeeded intents less refunds, without a Billing invoice's tax", () => {
    const refunds: AirwallexRefund[] = [
      {
        id: "rfd_1",
        payment_intent_id: "int_partial",
        amount: 10,
        currency: "USD",
        status: "SETTLED",
      },
      {
        id: "rfd_2",
        payment_intent_id: "int_partial",
        amount: 5,
        currency: "USD",
        status: "FAILED",
      },
      {
        id: "rfd_3",
        payment_intent_id: "int_full",
        amount: 30,
        currency: "USD",
        status: "RECEIVED",
      },
    ];
    const payments = airwallexPayments(
      [
        intent("int_partial"),
        intent("int_full"),
        intent("int_sub", { amount: 33, captured_amount: 33, invoice_id: "inv_sub" }),
        intent("int_oneoff_invoice", { invoice_id: "inv_oneoff" }),
        intent("int_unknown_invoice", { invoice_id: "inv_elsewhere" }),
        intent("int_yen", { amount: 5000, captured_amount: 0, currency: "JPY" }),
        intent("int_pending", { status: "REQUIRES_CAPTURE" }),
        intent("int_no_date", { created_at: null }),
      ],
      refunds,
      invoices,
    );
    const byId = Object.fromEntries(payments.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual([
      "int_full",
      "int_oneoff_invoice",
      "int_partial",
      "int_sub",
      "int_unknown_invoice",
      "int_yen",
    ]);
    expect(byId.int_partial).toMatchObject({
      at: Date.UTC(2026, 9, 20, 10) / 1000,
      value: { currency: "usd", amount: 2000 },
      kind: "one_time",
    });
    expect(byId.int_full.value).toEqual({ currency: "usd", amount: 0 });
    expect(byId.int_sub.value!.amount).toBeCloseTo(3000, 6);
    expect(byId.int_sub.kind).toBe("subscription");
    expect(byId.int_oneoff_invoice.kind).toBe("one_time");
    expect(byId.int_unknown_invoice.kind).toBe("unknown");
    // A zero-decimal currency, and the amount when nothing was captured separately.
    expect(byId.int_yen.value).toEqual({ currency: "jpy", amount: 5000 });
  });

  it("change their fingerprint when a refund comes in", () => {
    const before = airwallexPayments([intent("int_a")], [], invoices)[0];
    const after = airwallexPayments(
      [intent("int_a")],
      [{ id: "rfd", payment_intent_id: "int_a", amount: 1, currency: "USD", status: "ACCEPTED" }],
      invoices,
    )[0];
    expect(before.fingerprint).not.toBe(after.fingerprint);
    expect(after.value!.amount).toBe(2900);
  });
});
