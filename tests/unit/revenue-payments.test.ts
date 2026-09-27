import { describe, expect, it } from "vitest";
import { invoicePayments, refundedByInvoice } from "../../src/lib/revenue/chargebee/payments";
import { creemEarned, transactionPayments } from "../../src/lib/revenue/creem/payments";
import type { CreemTransaction } from "../../src/lib/revenue/creem/mrr";
import { dodoEarned, dodoFingerprint } from "../../src/lib/revenue/dodo/payments";
import type { PaddleTransaction } from "../../src/lib/revenue/paddle/mrr";
import {
  transactionEarned,
  transactionPayments as paddlePayments,
} from "../../src/lib/revenue/paddle/payments";
import {
  collectPayments,
  coveredFrom,
  dayOf,
  dayStart,
  FIRST_DAY,
  revenueWindows,
  rereadFrom,
} from "../../src/lib/revenue/payments";
import type { PolarOrder } from "../../src/lib/revenue/polar/mrr";
import { orderPayments } from "../../src/lib/revenue/polar/payments";
import { chartPayments } from "../../src/lib/revenue/revenuecat/payments";
import {
  chargePayments,
  isPaid,
  knownShares,
  lostByCharge,
  sharesOf,
  storedShare,
  untaxedShares,
  type StripeCharge,
} from "../../src/lib/revenue/stripe/payments";
import type { ListedPayment, PaymentRead } from "../../src/lib/revenue/types";
import type { WhopPayment } from "../../src/lib/revenue/whop/mrr";
import { whopEarned, whopPayments } from "../../src/lib/revenue/whop/payments";

const NOW = new Date("2026-09-27T12:00:00Z");
const at = (iso: string) => Date.parse(iso) / 1000;

function payment(id: string, iso: string, amount = 1000): ListedPayment {
  return { id, at: at(iso), fingerprint: String(amount), value: { currency: "usd", amount } };
}

describe("days and windows", () => {
  it("counts UTC days", () => {
    expect(dayOf(at("2026-09-27T23:59:59Z"))).toBe("2026-09-27");
    expect(dayStart("2026-09-27")).toBe(at("2026-09-27T00:00:00Z"));
    expect(rereadFrom(NOW)).toBe("2026-03-28");
  });

  it("covers the last 30 days and the last 12 months up to today", () => {
    expect(revenueWindows(NOW)).toEqual({ days30: "2026-08-29", months12: "2025-09-28" });
    // A year back from the 29th of February is the 28th, so the window starts on the 1st of March.
    expect(revenueWindows(new Date("2028-02-29T08:00:00Z")).months12).toBe("2027-03-01");
  });
});

describe("coveredFrom", () => {
  const read = (payments: ListedPayment[], complete = false, from?: number): PaymentRead => ({
    payments,
    complete,
    from,
  });

  it("covers the whole window once the read reached its start", () => {
    expect(coveredFrom(read([], true), "2026-01-01", "2026-09-28")).toBe("2026-01-01");
  });

  it("leaves the oldest day of an unfinished list for the next read", () => {
    const payments = [payment("a", "2026-09-20T10:00:00Z"), payment("b", "2026-09-18T09:00:00Z")];
    expect(coveredFrom(read(payments), "2026-01-01", "2026-09-28")).toBe("2026-09-19");
  });

  it("takes the day a read says it covers from, rounded up to a whole day", () => {
    expect(coveredFrom(read([], false, at("2026-09-10T00:00:00Z")), FIRST_DAY, "2026-09-28")).toBe(
      "2026-09-10",
    );
    expect(coveredFrom(read([], false, at("2026-09-10T05:00:00Z")), FIRST_DAY, "2026-09-28")).toBe(
      "2026-09-11",
    );
  });

  it("covers nothing when an unfinished read reached no whole day", () => {
    expect(coveredFrom(read([]), FIRST_DAY, "2026-09-28")).toBeNull();
    expect(
      coveredFrom(read([payment("a", "2026-09-27T01:00:00Z")]), FIRST_DAY, "2026-09-28"),
    ).toBeNull();
  });
});

describe("collectPayments", () => {
  const pages = { recent: 200, older: 100 };

  it("reads the last six months, then older payments back to the first", async () => {
    const calls: [string, string | null][] = [];
    const plan = await collectPayments(
      { from: null, origin: false, readAt: null },
      NOW,
      async (since, before) => {
        calls.push([since, before]);
        return before === null
          ? { payments: [payment("new", "2026-09-01T00:00:00Z")], complete: true }
          : { payments: [payment("old", "2025-01-01T00:00:00Z")], complete: true };
      },
      pages,
    );
    expect(calls).toEqual([
      ["2026-03-28", null],
      [FIRST_DAY, "2026-03-28"],
    ]);
    expect(plan).toMatchObject({
      windows: [
        { from: "2026-03-28", to: null },
        { from: FIRST_DAY, to: "2026-03-28" },
      ],
      from: FIRST_DAY,
      origin: true,
    });
    expect(plan!.listed.map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("goes on from where the stored payments start", async () => {
    const calls: [string, string | null][] = [];
    const plan = await collectPayments(
      { from: "2025-06-01", origin: false, readAt: "2026-09-26T12:00:00Z" },
      NOW,
      async (since, before) => {
        calls.push([since, before]);
        return before === null
          ? { payments: [], complete: true }
          : {
              payments: [
                payment("may", "2025-05-20T10:00:00Z"),
                payment("april", "2025-04-02T10:00:00Z"),
              ],
              complete: false,
            };
      },
      pages,
    );
    expect(calls[1]).toEqual([FIRST_DAY, "2025-06-01"]);
    // The oldest day read may go on in the next page, so it is read again next time.
    expect(plan).toMatchObject({
      windows: [
        { from: "2026-03-28", to: null },
        { from: "2025-04-03", to: "2025-06-01" },
      ],
      from: "2025-04-03",
      origin: false,
    });
    expect(plan!.listed.map((p) => p.id)).toEqual(["may"]);
  });

  it("reads nothing older once the first payment was reached", async () => {
    let reads = 0;
    const plan = await collectPayments(
      { from: FIRST_DAY, origin: true, readAt: "2026-09-26T12:00:00Z" },
      NOW,
      async () => {
        reads++;
        return { payments: [], complete: true };
      },
      pages,
    );
    expect(reads).toBe(1);
    expect(plan).toMatchObject({ from: FIRST_DAY, origin: true });
  });

  it("starts over after a gap longer than the six months read again", async () => {
    const plan = await collectPayments(
      { from: FIRST_DAY, origin: true, readAt: "2026-02-01T12:00:00Z" },
      NOW,
      async (_since, before) =>
        before === null ? { payments: [], complete: true } : { payments: [], complete: false },
      pages,
    );
    expect(plan).toMatchObject({ from: "2026-03-28", origin: false });
  });

  it("keeps an unfinished first listing and reads nothing older yet", async () => {
    let reads = 0;
    const plan = await collectPayments(
      { from: null, origin: false, readAt: null },
      NOW,
      async () => {
        reads++;
        return { payments: [payment("a", "2026-09-20T10:00:00Z")], complete: false };
      },
      pages,
    );
    expect(reads).toBe(1);
    expect(plan).toMatchObject({
      windows: [{ from: "2026-09-21", to: null }],
      from: "2026-09-21",
      origin: false,
      listed: [],
    });
  });

  it("gives up when not even one day could be read", async () => {
    expect(
      await collectPayments(
        { from: null, origin: false, readAt: null },
        NOW,
        async () => ({ payments: [], complete: false }),
        pages,
      ),
    ).toBeNull();
  });
});

describe("Stripe charges", () => {
  function charge(overrides: Partial<StripeCharge> = {}): StripeCharge {
    return {
      id: "ch_1",
      amount_captured: 12000,
      amount_refunded: 0,
      captured: true,
      currency: "eur",
      created: at("2026-09-20T10:00:00Z"),
      disputed: false,
      status: "succeeded",
      payment_intent: "pi_1",
      ...overrides,
    };
  }

  it("counts captured charges that succeeded", () => {
    expect(isPaid(charge())).toBe(true);
    expect(isPaid(charge({ captured: false }))).toBe(false);
    expect(isPaid(charge({ status: "failed" }))).toBe(false);
  });

  it("takes the untaxed share from the invoice or Checkout Session", () => {
    const shares = untaxedShares(
      [
        {
          id: "in_1",
          total: 12000,
          total_excluding_tax: 10000,
          payments: { data: [{ payment: { type: "payment_intent", payment_intent: "pi_1" } }] },
        },
        {
          id: "in_old",
          total: 5000,
          total_excluding_tax: 5000,
          payments: { data: [{ payment: { type: "charge", charge: "ch_old" } }] },
        },
      ],
      [
        {
          id: "cs_1",
          payment_intent: { id: "pi_2" },
          payment_status: "paid",
          amount_total: 1250,
          total_details: { amount_tax: 250 },
        },
      ],
    );
    expect(shares.get("pi_1")).toBeCloseTo(10000 / 12000);
    expect(shares.get("ch_old")).toBe(1);
    expect(shares.get("pi_2")).toBeCloseTo(0.8);
    const needed = [
      charge(),
      charge({ id: "ch_2", payment_intent: "pi_2" }),
      charge({ id: "ch_old", payment_intent: null }),
      charge({ id: "ch_direct", payment_intent: "pi_direct" }),
    ];
    expect(Object.fromEntries(sharesOf(needed, shares))).toEqual({
      ch_1: 10000 / 12000,
      ch_2: 0.8,
      ch_old: 1,
      ch_direct: 1,
    });
  });

  it("earns what was captured, less refunds and lost disputes, without tax", () => {
    const lost = lostByCharge([
      { id: "dp_1", charge: "ch_1", amount: 2000, status: "lost" },
      { id: "dp_2", charge: { id: "ch_1" }, amount: 5000, status: "won" },
    ]);
    const [listed] = chargePayments(
      [charge({ amount_refunded: 1000 })],
      lost,
      new Map([["ch_1", 10000 / 12000]]),
    );
    expect(listed).toMatchObject({ id: "ch_1", fingerprint: "12000:1000:2000" });
    expect(listed.value!.amount).toBeCloseTo((12000 - 3000) * (10000 / 12000));
    expect(chargePayments([charge()], new Map(), new Map())[0].value).toBeNull();
  });

  it("values only new and changed charges, keeping a changed one's share", () => {
    const stored = new Map([
      ["ch_same", { fingerprint: "12000:0:0", amount: 10000 }],
      ["ch_refunded", { fingerprint: "12000:0:0", amount: 10000 }],
      ["ch_zero", { fingerprint: "12000:12000:0", amount: 0 }],
    ]);
    const { shares, needed } = knownShares(
      [
        charge({ id: "ch_same" }),
        charge({ id: "ch_refunded", amount_refunded: 6000 }),
        charge({ id: "ch_zero", amount_refunded: 6000 }),
        charge({ id: "ch_new" }),
      ],
      new Map(),
      (id) => stored.get(id) ?? null,
    );
    expect(Object.fromEntries(shares)).toEqual({ ch_refunded: 10000 / 12000 });
    expect(needed.map((c) => c.id)).toEqual(["ch_zero", "ch_new"]);
    expect(storedShare({ fingerprint: "12000:0:0", amount: 12000 })).toBe(1);
  });
});

describe("Paddle transactions", () => {
  function transaction(details: Partial<PaddleTransaction["details"]>): PaddleTransaction {
    return {
      id: "txn_1",
      status: "completed",
      subscription_id: null,
      currency_code: "USD",
      billed_at: "2026-09-20T10:00:00Z",
      billing_period: null,
      items: [],
      details: { line_items: [], ...details },
    };
  }

  it("earns the grand total without tax, which leaves out credit", () => {
    expect(
      transactionEarned(
        transaction({
          totals: { total: "12000", tax: "2000", grand_total: "6000", grand_total_tax: "1000" },
        }),
      ),
    ).toBe(5000);
    expect(transactionEarned(transaction({ totals: { total: "12000", tax: "2000" } }))).toBe(10000);
  });

  it("takes off what adjustments took back, without tax", () => {
    const refunded = transaction({
      totals: { total: "12000", tax: "2000", grand_total: "12000", grand_total_tax: "2000" },
      adjusted_totals: { total: "6000", tax: "1000" },
    });
    expect(transactionEarned(refunded)).toBe(5000);
    expect(paddlePayments([refunded])[0]).toMatchObject({
      id: "txn_1",
      at: at("2026-09-20T10:00:00Z"),
      fingerprint: "6000:1000",
    });
  });
});

describe("Polar orders", () => {
  it("earns the net amount less refunds", () => {
    const order = {
      id: "ord_1",
      status: "partially_refunded",
      billing_reason: "purchase",
      subscription_id: null,
      currency: "usd",
      subtotal_amount: 5000,
      discount_amount: 1000,
      net_amount: 4000,
      tax_amount: 800,
      total_amount: 4800,
      refunded_amount: 1500,
      created_at: "2026-09-20T10:00:00Z",
      items: [],
      product: null,
    } as PolarOrder;
    expect(orderPayments([order])).toEqual([
      {
        id: "ord_1",
        at: at("2026-09-20T10:00:00Z"),
        fingerprint: "4000:1500",
        value: { currency: "usd", amount: 2500 },
      },
    ]);
  });
});

describe("Dodo Payments", () => {
  it("earns the total without tax, less refunds at the same share", () => {
    expect(
      dodoEarned({
        payment_id: "pay_1",
        total_amount: 12000,
        tax: 2000,
        refunds: [
          { amount: 6000, status: "succeeded" },
          { amount: 6000, status: "failed" },
        ],
      }),
    ).toBe(5000);
  });

  it("earns nothing once a dispute is lost", () => {
    expect(
      dodoEarned({
        payment_id: "pay_1",
        total_amount: 12000,
        tax: 0,
        disputes: [{ dispute_status: "dispute_lost" }],
      }),
    ).toBe(0);
  });

  it("fingerprints what the list shows of refunds and disputes", () => {
    expect(
      dodoFingerprint({
        payment_id: "pay_1",
        total_amount: 12000,
        currency: "USD",
        created_at: "2026-09-20T10:00:00Z",
        refund_status: "partial",
      }),
    ).toBe("12000:partial:");
  });
});

describe("Creem transactions", () => {
  function transaction(overrides: Partial<CreemTransaction> = {}): CreemTransaction {
    return {
      id: "tran_1",
      amount: 1000,
      amount_paid: 1210,
      tax_amount: 210,
      currency: "EUR",
      type: "payment",
      status: "paid",
      created_at: at("2026-09-20T10:00:00Z") * 1000,
      ...overrides,
    };
  }

  it("earns what was paid without tax, less refunds at the same share", () => {
    expect(creemEarned(transaction())).toBe(1000);
    expect(creemEarned(transaction({ status: "partialRefund", refunded_amount: 605 }))).toBe(500);
    expect(creemEarned(transaction({ status: "chargedBack" }))).toBe(0);
  });

  it("lists paid transactions of the window only", () => {
    const listed = transactionPayments(
      [
        transaction(),
        transaction({ id: "tran_pending", status: "pending" }),
        transaction({ id: "tran_old", created_at: at("2026-01-01T00:00:00Z") * 1000 }),
      ],
      at("2026-03-28T00:00:00Z"),
      null,
    );
    expect(listed.map((p) => [p.id, p.at])).toEqual([["tran_1", at("2026-09-20T10:00:00Z")]]);
  });
});

describe("Chargebee invoices", () => {
  it("earns what was paid at the invoice's untaxed share, less cash refunds", () => {
    const refunded = refundedByInvoice([
      {
        id: "cn_1",
        reference_invoice_id: "1001",
        total: 1200,
        amount_refunded: 1200,
        taxes: [{ amount: 200 }],
      },
      { id: "cn_2", reference_invoice_id: "1002", total: 500, amount_refunded: 0 },
    ]);
    const payments = invoicePayments(
      "acme",
      [
        {
          id: "1001",
          status: "paid",
          price_type: "tax_exclusive",
          currency_code: "USD",
          date: at("2026-09-20T10:00:00Z"),
          total: 12000,
          tax: 2000,
          amount_paid: 12000,
        },
        {
          id: "1002",
          status: "paid",
          price_type: "tax_exclusive",
          currency_code: "USD",
          date: at("2026-09-21T10:00:00Z"),
          total: 5000,
          tax: 0,
          amount_paid: 3000,
        },
      ],
      refunded,
    );
    expect(payments.map((p) => [p.id, p.fingerprint, p.value!.amount])).toEqual([
      ["acme:1001", "12000:1000", 9000],
      ["acme:1002", "3000:0", 3000],
    ]);
  });
});

describe("Whop payments", () => {
  it("earns the total without tax, less refunds without tax, in minor units", () => {
    const paid = {
      id: "pay_1",
      status: "paid",
      substatus: "partially_refunded",
      billing_reason: "one_time",
      membership_id: null,
      plan_id: null,
      promo_code_id: null,
      paid_at: "2026-09-20T10:00:00Z",
      created_at: "2026-09-20T10:00:00Z",
      total: { amount: "120.00", currency: "usd" },
      tax_amount: { amount: "20.00", currency: "usd" },
      refunded_amount: { amount: "60.00", currency: "usd" },
      tax_refunded_amount: { amount: "10.00", currency: "usd" },
    } satisfies WhopPayment;
    expect(whopEarned(paid)).toBe(5000);
    expect(whopEarned({ ...paid, substatus: "dispute_lost" })).toBe(0);
    expect(whopPayments([paid])[0]).toMatchObject({
      id: "pay_1",
      fingerprint: "partially_refunded:60.00",
      value: { currency: "usd", amount: 5000 },
    });
  });
});

describe("RevenueCat revenue chart", () => {
  it("counts each day of the window with revenue as a payment of the project", () => {
    const points = [
      { at: at("2026-09-19T00:00:00Z"), value: 0 },
      { at: at("2026-09-20T00:00:00Z"), value: 12.5 },
      { at: at("2026-09-21T00:00:00Z"), value: 30 },
    ];
    expect(
      chartPayments("proj1", points, "usd", at("2026-09-01T00:00:00Z"), at("2026-09-21T00:00:00Z")),
    ).toEqual([
      {
        id: "proj1:2026-09-20",
        at: at("2026-09-20T00:00:00Z"),
        fingerprint: "12.5",
        value: { currency: "usd", amount: 1250 },
      },
    ]);
  });
});
