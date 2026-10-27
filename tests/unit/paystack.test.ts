import { describe, expect, it } from "vitest";
import { mrrAt } from "../../src/lib/revenue/history";
import { AVERAGE_MONTH_DAYS } from "../../src/lib/revenue/money";
import { lastPage } from "../../src/lib/revenue/paystack/client";
import { parsePaystackKey } from "../../src/lib/revenue/paystack/key";
import {
  charged,
  paystackMinor,
  paystackMrr,
  paystackServiceLines,
  periodEnd,
  planIndex,
  planMonths,
  subscriptionPlans,
  subscriptionsFromPlans,
  transactionPlan,
  unlistedNote,
  type PaystackPlan,
  type PaystackSubscription,
  type PaystackTransaction,
} from "../../src/lib/revenue/paystack/mrr";
import {
  paystackPayments,
  refundedByTransaction,
  refundedStatus,
  type PaystackRefund,
} from "../../src/lib/revenue/paystack/payments";

const DAY = 86_400;
const at = (year: number, month: number, day = 1) => Date.UTC(year, month, day) / 1000;
const NOW = at(2026, 9, 27) + 12 * 3_600;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

// Shapes as Paystack documents them: the plan carried by a subscription, and by a transaction.
const plan = (code: string, amount: number, interval: string, currency = "NGN"): PaystackPlan => ({
  id: Number(code.replace(/\D/g, "")) || 1,
  plan_code: code,
  amount,
  interval,
  currency,
});
const MONTHLY = plan("PLN_1", 500_000, "monthly");
const ANNUAL = plan("PLN_2", 6_000_000, "annually");
const QUARTERLY = plan("PLN_3", 300_000, "quarterly");
const WEEKLY = plan("PLN_4", 70_000, "weekly", "GHS");

const subscription = (
  code: string,
  status: string,
  onPlan: PaystackPlan | number,
  customer: number,
  overrides: Partial<PaystackSubscription> = {},
): PaystackSubscription => ({
  subscription_code: code,
  status,
  amount: typeof onPlan === "object" ? onPlan.amount : 100_000,
  start: at(2026, 0, 1),
  plan: onPlan,
  customer: { id: customer, customer_code: `CUS_${customer}` },
  ...overrides,
});

const transaction = (
  id: number,
  paid: number,
  amount: number,
  overrides: Partial<PaystackTransaction> = {},
): PaystackTransaction => ({
  id,
  status: "success",
  amount,
  requested_amount: amount,
  currency: "NGN",
  paid_at: iso(paid),
  created_at: iso(paid - 60),
  plan: {},
  ...overrides,
});

describe("Paystack keys", () => {
  const body = "0123456789abcdef0123456789abcdef01234567";

  it("accepts restricted keys, live ones always and test ones where allowed", () => {
    expect(parsePaystackKey(` rk_live_${body} `, { allowTest: false })).toEqual({
      key: `rk_live_${body}`,
      livemode: true,
      hint: "rk_live_…4567",
    });
    expect(parsePaystackKey(`rk_test_${body}`, { allowTest: true })).toMatchObject({
      livemode: false,
      hint: "rk_test_…4567",
    });
    expect(() => parsePaystackKey(`rk_test_${body}`, { allowTest: false })).toThrow(/Test keys/);
    // A short test key is still a test key.
    expect(() => parsePaystackKey("rk_test_abcdefghijkl", { allowTest: false })).toThrow(
      /Test keys/,
    );
    // Paystack documents only the test prefix, so any other restricted key is live.
    expect(parsePaystackKey(`rk_${body}`, { allowTest: false })).toMatchObject({
      livemode: true,
      hint: "rk_…4567",
    });
  });

  it("refuses secret, public and other providers' keys with what to paste instead", () => {
    expect(() => parsePaystackKey(`sk_live_${body}`, { allowTest: true })).toThrow(
      /secret key, which can do everything/,
    );
    expect(() => parsePaystackKey(`sk_test_${body}`, { allowTest: true })).toThrow(/secret key/);
    expect(() => parsePaystackKey(`pk_live_${body}`, { allowTest: true })).toThrow(/public key/);
    expect(() => parsePaystackKey(`pdl_live_apikey_${body}`, { allowTest: true })).toThrow(
      /another payment provider/,
    );
    expect(() => parsePaystackKey("rk_live_short", { allowTest: true })).toThrow(/restricted key/);
    expect(() => parsePaystackKey("", { allowTest: true })).toThrow(/restricted key/);
  });
});

describe("Paystack amounts", () => {
  it("are hundredths of the major unit, XOF included", () => {
    expect(paystackMinor(500_000, "NGN")).toBe(500_000);
    expect(paystackMinor(2_500, "usd")).toBe(2_500);
    // XOF 5,000 is sent as 500,000, and is 5,000 minor units, since XOF has none.
    expect(paystackMinor(500_000, "XOF")).toBe(5_000);
  });

  it("charge what was asked for, without fees passed on, or what a partial debit took", () => {
    expect(charged(transaction(1, NOW, 40_333, { requested_amount: 30_050 }))).toBe(30_050);
    expect(charged(transaction(1, NOW, 20_000, { requested_amount: 50_000 }))).toBe(20_000);
    expect(charged(transaction(1, NOW, 20_000, { requested_amount: null }))).toBe(20_000);
  });

  it("have months for every plan interval", () => {
    expect(planMonths("hourly")).toBeCloseTo(1 / 24 / AVERAGE_MONTH_DAYS, 12);
    expect(planMonths("daily")).toBeCloseTo(1 / AVERAGE_MONTH_DAYS, 12);
    expect(planMonths("weekly")).toBeCloseTo(7 / AVERAGE_MONTH_DAYS, 12);
    expect(planMonths("monthly")).toBe(1);
    expect(planMonths("quarterly")).toBe(3);
    expect(planMonths("biannually")).toBe(6);
    expect(planMonths("annually")).toBe(12);
    expect(planMonths("Monthly")).toBe(1);
    expect(planMonths("fortnightly")).toBeNull();
    expect(planMonths("constructor")).toBeNull();
    expect(planMonths(null)).toBeNull();
  });
});

describe("Paystack MRR", () => {
  it("counts active, non-renewing and attention subscriptions by their plan's interval", () => {
    const result = paystackMrr(
      [
        subscription("SUB_a", "active", MONTHLY, 1),
        subscription("SUB_b", "non-renewing", ANNUAL, 2),
        subscription("SUB_c", "attention", QUARTERLY, 3),
        subscription("SUB_d", "active", WEEKLY, 4),
        subscription("SUB_e", "cancelled", MONTHLY, 5),
        subscription("SUB_f", "completed", MONTHLY, 6),
        subscription("SUB_g", "complete", MONTHLY, 7),
      ],
      NOW,
    );
    expect(result.byCurrency.ngn).toBe(500_000 + 500_000 + 100_000);
    expect(result.byCurrency.ghs).toBeCloseTo(70_000 * (AVERAGE_MONTH_DAYS / 7), 6);
    expect(result).toMatchObject({
      customers: 4,
      subscriptionIds: ["SUB_a", "SUB_b", "SUB_c", "SUB_d"],
      skippedItems: 0,
    });
  });

  it("values a subscription by its own amount, which can differ from its plan's", () => {
    const result = paystackMrr(
      [subscription("SUB_a", "active", MONTHLY, 1, { amount: 450_000 })],
      NOW,
    );
    expect(result.byCurrency).toEqual({ ngn: 450_000 });
  });

  it("leaves out a free period, and skips a subscription without a readable plan", () => {
    const result = paystackMrr(
      [
        subscription("SUB_trial", "active", MONTHLY, 1, { start: NOW + 7 * DAY }),
        // Paystack's times may come in milliseconds.
        subscription("SUB_trial_ms", "active", MONTHLY, 2, { start: (NOW + DAY) * 1000 }),
        subscription("SUB_id", "active", 101, 3),
        subscription("SUB_odd", "active", plan("PLN_9", 1000, "fortnightly"), 4),
        subscription("SUB_none", "active", MONTHLY, 5, { amount: null, plan: {} }),
      ],
      NOW,
    );
    expect(result).toEqual({ byCurrency: {}, customers: 0, subscriptionIds: [], skippedItems: 3 });
  });

  it("counts each customer and subscription once, and claims a free subscription", () => {
    const result = paystackMrr(
      [
        subscription("SUB_a", "active", MONTHLY, 1),
        subscription("SUB_a", "active", MONTHLY, 1),
        subscription("SUB_b", "active", QUARTERLY, 1),
        subscription("SUB_free", "active", MONTHLY, 2, { amount: 0 }),
      ],
      NOW,
    );
    expect(result).toMatchObject({
      byCurrency: { ngn: 500_000 + 100_000 },
      customers: 1,
      subscriptionIds: ["SUB_a", "SUB_b", "SUB_free"],
    });
  });

  it("reads the subscriptions that the plan list gives, with their plan, and notes missing ones", () => {
    const { subscriptions, unlisted } = subscriptionsFromPlans([
      {
        ...MONTHLY,
        subscriptions: [
          subscription("SUB_a", "active", 1, 1, { customer: 11, amount: 500_000 }),
          subscription("SUB_b", "cancelled", 1, 12, { customer: 12, amount: 500_000 }),
        ],
        total_subscriptions: 3,
      },
      { ...ANNUAL, subscriptions: [], total_subscriptions: 0 },
      { ...QUARTERLY, subscriptions: null },
    ]);
    expect(unlisted).toBe(1);
    expect(subscriptions.map((s) => (s.plan as PaystackPlan).plan_code)).toEqual([
      "PLN_1",
      "PLN_1",
    ]);
    expect(subscriptions[0].plan).not.toHaveProperty("subscriptions");
    expect(paystackMrr(subscriptions, NOW)).toMatchObject({
      byCurrency: { ngn: 500_000 },
      customers: 1,
      subscriptionIds: ["SUB_a"],
    });
    expect(unlistedNote(0)).toBeNull();
    expect(unlistedNote(1)).toBe(
      "Paystack did not list 1 subscription to your plans, so MRR may leave it out.",
    );
    expect(unlistedNote(4)).toBe(
      "Paystack did not list 4 subscriptions to your plans, so MRR may leave them out.",
    );
  });
});

describe("Paystack plans on transactions", () => {
  it("are an object, an empty object for none, or a code with the plan beside it", () => {
    expect(transactionPlan(transaction(1, NOW, 100, { plan: {} }))).toBeNull();
    expect(transactionPlan(transaction(1, NOW, 100, { plan: null }))).toBeNull();
    expect(transactionPlan(transaction(1, NOW, 100, { plan: MONTHLY }))).toEqual({
      own: MONTHLY,
      ref: "PLN_1",
    });
    expect(
      transactionPlan(transaction(1, NOW, 100, { plan: "PLN_2", plan_object: ANNUAL })),
    ).toEqual({ own: ANNUAL, ref: "PLN_2" });
    expect(transactionPlan(transaction(1, NOW, 100, { plan: "PLN_3", plan_object: {} }))).toEqual({
      own: null,
      ref: "PLN_3",
    });
  });

  it("index by code and by id", () => {
    const index = subscriptionPlans([
      subscription("SUB_a", "active", MONTHLY, 1),
      subscription("SUB_b", "active", 7, 2),
    ]);
    expect(index.get("PLN_1")).toBe(MONTHLY);
    expect(index.get("1")).toBe(MONTHLY);
    expect(index.size).toBe(2);
  });
});

describe("Paystack history", () => {
  it("runs monthly and longer plans to the same date, the month's last day where shorter", () => {
    expect(periodEnd(at(2026, 0, 31) + 3_600, "monthly")).toBe(at(2026, 1, 28) + 3_600);
    expect(periodEnd(at(2026, 0, 15), "quarterly")).toBe(at(2026, 3, 15));
    expect(periodEnd(at(2026, 0, 15), "annually")).toBe(at(2027, 0, 15));
    expect(periodEnd(at(2026, 0, 15), "weekly")).toBe(at(2026, 0, 22));
    expect(periodEnd(at(2026, 0, 15), "daily")).toBe(at(2026, 0, 16));
    expect(periodEnd(at(2026, 0, 15), "hourly")).toBe(at(2026, 0, 15) + 3_600);
  });

  it("counts successful charges of plans over one interval, without fees passed on", () => {
    const plans = planIndex([QUARTERLY]);
    const lines = paystackServiceLines(
      [
        transaction(1, at(2026, 0, 1), 507_500, { requested_amount: 500_000, plan: MONTHLY }),
        transaction(2, at(2026, 1, 1), 500_000, { plan: MONTHLY }),
        transaction(2, at(2026, 1, 1), 500_000, { plan: MONTHLY }),
        // The verify shape: the code, with the plan beside it or only in the index.
        transaction(3, at(2026, 0, 10), 300_000, { plan: "PLN_3", plan_object: {} }),
        transaction(4, at(2026, 1, 1), 70_000, { plan: WEEKLY, currency: "GHS" }),
        transaction(5, at(2026, 1, 1), 500_000, { plan: MONTHLY, status: "reversed" }),
        transaction(6, at(2026, 1, 1), 500_000, { plan: MONTHLY, status: "failed" }),
        transaction(7, at(2026, 1, 1), 900_000),
        transaction(8, at(2026, 1, 1), 300_000, { plan: "PLN_unknown" }),
      ],
      plans,
    );
    expect(lines).toEqual([
      { start: at(2026, 0, 1), end: at(2026, 1, 1), currency: "ngn", monthly: 500_000 },
      { start: at(2026, 1, 1), end: at(2026, 2, 1), currency: "ngn", monthly: 500_000 },
      { start: at(2026, 0, 10), end: at(2026, 3, 10), currency: "ngn", monthly: 100_000 },
      {
        start: at(2026, 1, 1),
        end: at(2026, 1, 8),
        currency: "ghs",
        monthly: 70_000 / (7 / AVERAGE_MONTH_DAYS),
      },
    ]);
    // January's last second is covered, though January is longer than the average month.
    expect(mrrAt(lines.slice(0, 3), at(2026, 1, 1) - 1)).toEqual({ ngn: 600_000 });
  });
});

describe("Paystack revenue", () => {
  const refund = (
    id: number,
    of: PaystackRefund["transaction"],
    amount: number,
    status = "processed",
  ): PaystackRefund => ({ id, transaction: of, amount, currency: "NGN", status });

  it("adds up the refunds that did not fail, whether they name the transaction or carry it", () => {
    const back = refundedByTransaction([
      refund(1, 10, 1_000),
      refund(2, { id: 10 }, 500, "pending"),
      refund(2, { id: 10 }, 500, "pending"),
      refund(3, 11, 2_000, "failed"),
      refund(4, null, 9_000),
    ]);
    expect([...back]).toEqual([[10, 1_500]]);
    expect(refundedStatus("reversed")).toBe(true);
    expect(refundedStatus("reversal pending")).toBe(true);
    expect(refundedStatus("reversal_pending")).toBe(true);
    expect(refundedStatus("success")).toBe(false);
  });

  it("values each paid transaction after refunds, without fees passed on", () => {
    const paid = at(2026, 9, 10);
    const payments = paystackPayments(
      [
        transaction(1, paid, 507_500, { requested_amount: 500_000, plan: MONTHLY }),
        transaction(2, paid, 300_000, { status: "reversed" }),
        transaction(3, paid, 250_000, { status: "reversed" }),
        transaction(4, paid, 400_000),
        transaction(5, paid, 600_000, { status: "abandoned" }),
        transaction(6, paid, 600_000, { status: "failed" }),
        transaction(7, paid, 101_500, {
          requested_amount: 100_000,
          status: "reversal pending",
        }),
        transaction(8, paid, 500_000, { currency: "XOF" }),
      ],
      [refund(21, 2, 100_000), refund(22, 4, 400_000, "failed"), refund(23, 7, 101_500, "pending")],
      at(2026, 9, 1),
      null,
    );
    expect(payments).toEqual([
      {
        id: "1",
        at: paid,
        fingerprint: "success:0",
        value: { currency: "ngn", amount: 500_000 },
        kind: "subscription",
      },
      {
        id: "2",
        at: paid,
        fingerprint: "reversed:100000",
        value: { currency: "ngn", amount: 200_000 },
        kind: "one_time",
      },
      // Reversed without a refund the read shows: refunded in full.
      {
        id: "3",
        at: paid,
        fingerprint: "reversed:250000",
        value: { currency: "ngn", amount: 0 },
        kind: "one_time",
      },
      {
        id: "4",
        at: paid,
        fingerprint: "success:0",
        value: { currency: "ngn", amount: 400_000 },
        kind: "one_time",
      },
      {
        id: "7",
        at: paid,
        fingerprint: "reversal pending:101500",
        value: { currency: "ngn", amount: 0 },
        kind: "one_time",
      },
      {
        id: "8",
        at: paid,
        fingerprint: "success:0",
        value: { currency: "xof", amount: 5_000 },
        kind: "one_time",
      },
    ]);
  });

  it("takes a partial refund off at the share that was asked for", () => {
    const [payment] = paystackPayments(
      [transaction(1, NOW, 101_500, { requested_amount: 100_000, status: "reversed" })],
      [refund(1, 1, 50_750)],
      0,
      null,
    );
    expect(payment.value).toEqual({ currency: "ngn", amount: 50_000 });
  });

  it("keeps to the window by when each was paid, and lists each once", () => {
    const list = [
      transaction(1, at(2026, 8, 30) + 23 * 3_600, 1_000),
      transaction(2, at(2026, 9, 1), 1_000, { created_at: iso(at(2026, 8, 30)) }),
      transaction(2, at(2026, 9, 1), 1_000, { created_at: iso(at(2026, 8, 30)) }),
      transaction(3, at(2026, 9, 15) - 1, 1_000),
      transaction(4, at(2026, 9, 15), 1_000),
      // Without a payment time, the creation time counts.
      transaction(5, at(2026, 9, 2), 1_000, { paid_at: null }),
    ];
    const ids = (since: number, before: number | null) =>
      paystackPayments(list, [], since, before).map((payment) => payment.id);
    expect(ids(at(2026, 9, 1), at(2026, 9, 15))).toEqual(["2", "3", "5"]);
    expect(ids(at(2026, 9, 15), null)).toEqual(["4"]);
  });
});

describe("Paystack pages", () => {
  it("end when empty, or where the page count or the page size says", () => {
    expect(lastPage({ page: 1, pageCount: 3 }, 100, 1)).toBe(false);
    expect(lastPage({ page: 3, pageCount: 3 }, 100, 3)).toBe(true);
    expect(lastPage(null, 0, 1)).toBe(true);
    expect(lastPage({ perPage: "100" }, 100, 1)).toBe(false);
    expect(lastPage({ perPage: 50 }, 20, 1)).toBe(true);
    expect(lastPage(null, 100, 1)).toBe(false);
  });
});
