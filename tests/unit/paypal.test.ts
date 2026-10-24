import { describe, expect, it } from "vitest";
import { splitAccountKey } from "../../src/lib/revenue/account-key";
import {
  readsOnly,
  requireReadOnly,
  SEARCH_SCOPE,
  searchStart,
} from "../../src/lib/revenue/paypal/client";
import { parsePayPalKey } from "../../src/lib/revenue/paypal/key";
import {
  billingMonths,
  GRACE,
  mrrWindowStart,
  paypalMrr,
  paypalSeconds,
  paypalServiceLines,
  subscriptionCharges,
  type PayPalTransaction,
} from "../../src/lib/revenue/paypal/mrr";
import { paypalPayments } from "../../src/lib/revenue/paypal/payments";
import { AVERAGE_MONTH_DAYS } from "../../src/lib/revenue/money";
import { mrrAt } from "../../src/lib/revenue/history";

const DAY = 86_400;
const at = (year: number, month: number, day = 1) => Date.UTC(year, month, day) / 1000;
const NOW = at(2026, 9, 24) + 12 * 3_600;
const time = (seconds: number) =>
  new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "+0000");

const payment = (
  id: string,
  seconds: number,
  value: string,
  overrides: Partial<PayPalTransaction> = {},
): PayPalTransaction => ({
  transaction_id: id,
  transaction_event_code: "T0002",
  transaction_initiation_date: time(seconds),
  transaction_amount: { currency_code: "USD", value },
  transaction_status: "S",
  paypal_reference_id: "I-A",
  paypal_reference_id_type: "SUB",
  ...overrides,
});

describe("PayPal credentials", () => {
  const clientId = "AbCdEfGhIjKlMnOpQrStUvWx-1";
  const secret = "EcYyRrShDkFk_Q0EdvzdGkzj58a66";

  it("keeps the Client ID and the secret together, with a hint of each", () => {
    const parsed = parsePayPalKey({ key: ` ${secret} `, account: ` ${clientId} ` });
    expect(parsed).toEqual({
      key: `${clientId}:${secret}`,
      livemode: null,
      hint: "AbCdEfGh… · …8a66",
    });
    expect(splitAccountKey(parsed.key)).toEqual({ account: clientId, key: secret });
  });

  it("refuses a missing Client ID, another provider's key and the Client ID twice", () => {
    expect(() => parsePayPalKey({ key: secret, account: "" })).toThrow(/Client ID/);
    expect(() => parsePayPalKey({ key: `rk_live_${"a".repeat(24)}`, account: clientId })).toThrow(
      /another payment provider/,
    );
    expect(() => parsePayPalKey({ key: "short", account: clientId })).toThrow(/secret/);
    expect(() => parsePayPalKey({ key: clientId, account: clientId })).toThrow(/Client ID again/);
  });
});

describe("PayPal app scopes", () => {
  it("accept reading reports, signing in and the app's webhooks", () => {
    expect(readsOnly(SEARCH_SCOPE)).toBe(true);
    expect(readsOnly("https://uri.paypal.com/services/reporting/balances/read")).toBe(true);
    expect(readsOnly("openid")).toBe(true);
    expect(readsOnly("https://uri.paypal.com/services/applications/webhooks")).toBe(true);
    expect(readsOnly("https://uri.paypal.com/services/payments/refund")).toBe(false);
    expect(readsOnly("https://uri.paypal.com/services/subscriptions")).toBe(false);
    expect(readsOnly("https://uri.paypal.com/payments/payouts")).toBe(false);
  });

  it("refuse an app that cannot search, or can do more than read", () => {
    expect(() => requireReadOnly([SEARCH_SCOPE, "openid"])).not.toThrow();
    expect(() => requireReadOnly(["openid"])).toThrow(/cannot search transactions/);
    expect(() =>
      requireReadOnly([SEARCH_SCOPE, "https://uri.paypal.com/services/invoicing"]),
    ).toThrow(/can do more than search transactions/);
  });
});

describe("PayPal times", () => {
  it("read offsets with and without a colon", () => {
    expect(paypalSeconds("2026-10-01T09:00:00+0000")).toBe(at(2026, 9) + 9 * 3_600);
    expect(paypalSeconds("2026-10-01T02:00:00-0700")).toBe(at(2026, 9) + 9 * 3_600);
    expect(paypalSeconds("2026-10-01T09:00:00Z")).toBe(at(2026, 9) + 9 * 3_600);
    expect(paypalSeconds("not a time")).toBeNull();
  });

  it("search back to the day after the same date three years ago", () => {
    expect(searchStart(NOW)).toBe(at(2023, 9, 25));
  });
});

describe("PayPal billing periods", () => {
  it("snap the time between payments to whole weeks or months", () => {
    expect(billingMonths(at(2026, 1), at(2026, 2))).toBe(1);
    expect(billingMonths(at(2026, 0, 31), at(2026, 2, 3))).toBe(1);
    expect(billingMonths(at(2026, 0), at(2026, 3))).toBe(3);
    expect(billingMonths(at(2025, 9), at(2026, 9))).toBe(12);
    expect(billingMonths(at(2026, 0), at(2026, 0, 8))).toBeCloseTo(7 / AVERAGE_MONTH_DAYS, 10);
    expect(billingMonths(at(2026, 0), at(2026, 0, 15))).toBeCloseTo(14 / AVERAGE_MONTH_DAYS, 10);
  });

  it("are unknown for any other gap", () => {
    expect(billingMonths(at(2026, 0), at(2026, 0, 2))).toBeNull();
    expect(billingMonths(at(2026, 0), at(2026, 1, 6))).toBeNull();
    expect(billingMonths(at(2026, 0), at(2027, 1))).toBeNull();
  });
});

describe("PayPal subscription payments", () => {
  it("count successful incoming payments of subscriptions once each, without tax", () => {
    const taxed = payment("TX1", at(2026, 8), "12.00", {
      sales_tax_amount: { currency_code: "USD", value: "2.00" },
    });
    const charges = subscriptionCharges([
      taxed,
      taxed,
      payment("TX2", at(2026, 8), "9.99", { paypal_reference_id: "I-B", transaction_status: "V" }),
      payment("TX3", at(2026, 8), "9.99", { paypal_reference_id: "I-C", transaction_status: "P" }),
      payment("TX4", at(2026, 8), "-9.99", { paypal_reference_id: "I-D" }),
      payment("TX5", at(2026, 8), "50.00", { transaction_event_code: "T0006" }),
      payment("TX6", at(2026, 8), "50.00", { paypal_reference_id_type: "TXN" }),
    ]);
    expect(charges).toEqual([
      { id: "TX1", subscription: "I-A", at: at(2026, 8), currency: "usd", amount: 1000 },
    ]);
  });
});

describe("PayPal MRR", () => {
  it("values a subscription by its latest payment over the time since the one before", () => {
    const charges = subscriptionCharges([
      payment("A1", at(2026, 7), "20.00"),
      payment("A2", at(2026, 8), "20.00"),
      payment("A3", at(2026, 9), "20.00"),
      payment("B1", at(2026, 4, 10), "30.00", { paypal_reference_id: "I-B" }),
      payment("B2", at(2026, 7, 10), "30.00", { paypal_reference_id: "I-B" }),
      payment("C1", at(2026, 9, 10), "9.00", {
        paypal_reference_id: "I-C",
        transaction_amount: { currency_code: "EUR", value: "9.00" },
      }),
      payment("C2", at(2026, 9, 17), "9.00", {
        paypal_reference_id: "I-C",
        transaction_amount: { currency_code: "EUR", value: "9.00" },
      }),
    ]);
    const result = paypalMrr(charges, NOW);
    expect(result.byCurrency.usd).toBe(3000);
    expect(result.byCurrency.eur).toBeCloseTo(900 * (AVERAGE_MONTH_DAYS / 7), 6);
    expect(result).toMatchObject({
      customers: 3,
      subscriptionIds: ["I-A", "I-B", "I-C"],
      skippedItems: 0,
      mrrNote: null,
    });
  });

  it("counts a subscription as yearly until two payments of one amount show its period", () => {
    const result = paypalMrr(
      subscriptionCharges([
        payment("A1", at(2026, 9, 1), "120.00"),
        payment("B1", at(2026, 8, 1), "1.00", { paypal_reference_id: "I-B" }),
        payment("B2", at(2026, 9, 1), "24.00", { paypal_reference_id: "I-B" }),
      ]),
      NOW,
    );
    expect(result.byCurrency.usd).toBe(1000 + 200);
    expect(result.mrrNote).toBe(
      "2 subscriptions count as yearly until their next payment shows how often they renew.",
    );
    expect(
      paypalMrr(subscriptionCharges([payment("A1", at(2026, 9, 1), "120.00")]), NOW).mrrNote,
    ).toBe("1 subscription counts as yearly until its next payment shows how often it renews.");
  });

  it("stops counting a subscription a week after its period ends", () => {
    const monthly = [
      payment("A1", at(2026, 7, 1), "20.00"),
      payment("A2", at(2026, 8, 1), "20.00"),
    ];
    const end = at(2026, 8, 1) + AVERAGE_MONTH_DAYS * DAY + GRACE;
    expect(paypalMrr(subscriptionCharges(monthly), end - 1).customers).toBe(1);
    expect(paypalMrr(subscriptionCharges(monthly), end)).toMatchObject({
      customers: 0,
      subscriptionIds: [],
    });
    // One payment counts for a year and a week.
    const once = [payment("A1", at(2025, 9, 1), "120.00")];
    expect(paypalMrr(subscriptionCharges(once), at(2026, 9, 1)).customers).toBe(1);
    expect(paypalMrr(subscriptionCharges(once), at(2026, 9, 10)).customers).toBe(0);
  });

  it("reads 13 months back, enough for every counted subscription's latest two payments", () => {
    expect(mrrWindowStart(new Date(NOW * 1000))).toBe(at(2025, 8, 24));
  });
});

describe("PayPal history", () => {
  it("lets each payment last until the next one of the same amount, without gaps", () => {
    const lines = paypalServiceLines(
      subscriptionCharges([
        payment("A1", at(2026, 0, 1), "20.00"),
        payment("A2", at(2026, 1, 1), "20.00"),
        payment("A3", at(2026, 2, 1), "20.00"),
      ]),
    );
    expect(lines).toEqual([
      { start: at(2026, 0, 1), end: at(2026, 1, 1), currency: "usd", monthly: 2000 },
      { start: at(2026, 1, 1), end: at(2026, 2, 1), currency: "usd", monthly: 2000 },
      {
        start: at(2026, 2, 1),
        end: at(2026, 2, 1) + AVERAGE_MONTH_DAYS * DAY,
        currency: "usd",
        monthly: 2000,
      },
    ]);
    // January's last second is covered, though January is longer than the average month.
    expect(mrrAt(lines, at(2026, 1, 1) - 1)).toEqual({ usd: 2000 });
  });

  it("counts a lone payment as yearly, until the subscription's next payment", () => {
    const lines = paypalServiceLines(
      subscriptionCharges([
        payment("A1", at(2026, 0, 1), "1.20"),
        payment("A2", at(2026, 1, 1), "24.00"),
      ]),
    );
    expect(lines[0]).toEqual({
      start: at(2026, 0, 1),
      end: at(2026, 1, 1),
      currency: "usd",
      monthly: 10,
    });
    expect(lines[1].monthly).toBe(200);
  });
});

describe("PayPal revenue", () => {
  const sale = (id: string, value: string, overrides: Partial<PayPalTransaction> = {}) =>
    payment(id, at(2026, 9, 10), value, {
      transaction_event_code: "T0006",
      paypal_reference_id: null,
      paypal_reference_id_type: null,
      ...overrides,
    });

  it("counts payments from customers without tax, less refunds at their untaxed share", () => {
    const payments = paypalPayments([
      sale("CHECKOUT", "60.00", { sales_tax_amount: { currency_code: "USD", value: "10.00" } }),
      sale("REFUND", "-12.00", {
        transaction_event_code: "T1107",
        paypal_reference_id: "CHECKOUT",
        paypal_reference_id_type: "TXN",
      }),
      sale("FULL", "25.00", { transaction_status: "V" }),
      sale("PENDING", "25.00", { transaction_status: "P" }),
      sale("DONATION", "5.00", { transaction_event_code: "T0013" }),
      sale("OUT", "-30.00"),
      payment("SUB", at(2026, 9, 1), "20.00"),
    ]);
    const byId = Object.fromEntries(payments.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual(["CHECKOUT", "FULL", "SUB"]);
    expect(byId.CHECKOUT).toMatchObject({
      at: at(2026, 9, 10),
      fingerprint: "S:6000:1200",
      kind: "one_time",
    });
    expect(byId.CHECKOUT.value!.amount).toBeCloseTo(5000 - 1000, 6);
    expect(byId.FULL).toMatchObject({
      value: { currency: "usd", amount: 0 },
      fingerprint: "V:2500:0",
    });
    expect(byId.SUB).toMatchObject({
      value: { currency: "usd", amount: 2000 },
      kind: "subscription",
    });
  });

  it("gives back a chargeback that was reversed", () => {
    const payments = paypalPayments([
      sale("SOLD", "40.00"),
      sale("CHARGEBACK", "-40.00", {
        transaction_event_code: "T1201",
        paypal_reference_id: "SOLD",
        paypal_reference_id_type: "TXN",
      }),
      sale("WON", "40.00", {
        transaction_event_code: "T1202",
        paypal_reference_id: "SOLD",
        paypal_reference_id_type: "TXN",
      }),
    ]);
    expect(payments).toHaveLength(1);
    expect(payments[0].value).toEqual({ currency: "usd", amount: 4000 });
  });
});
