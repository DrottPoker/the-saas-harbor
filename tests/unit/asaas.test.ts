import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASAAS, handleAsaas } from "../e2e/fake-asaas.mjs";
import { monthEnds, mrrAt } from "../../src/lib/revenue/history";
import { AVERAGE_MONTH_DAYS, toUsdCents } from "../../src/lib/revenue/money";
import { fetchPaidWindow } from "../../src/lib/revenue/asaas/client";
import { asaas } from "../../src/lib/revenue/asaas/index";
import { parseAsaasKey } from "../../src/lib/revenue/asaas/key";
import {
  asaasMrr,
  asaasServiceLines,
  chargeAmount,
  coverageStart,
  cycleEnd,
  dateStart,
  discountedValue,
  GRACE,
  paidUp,
  type AsaasPayment,
  type AsaasSubscription,
} from "../../src/lib/revenue/asaas/mrr";
import {
  asaasPayments,
  isReceivedTransfer,
  refundedAmount,
} from "../../src/lib/revenue/asaas/payments";

const DAY = 86_400;
const at = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;
const NOW = new Date("2026-10-24T12:00:00Z");

// Shapes as Asaas lists subscriptions and payments, amounts in reais.
const subscription = (
  id: string,
  value: number,
  cycle: string,
  overrides: Partial<AsaasSubscription> = {},
): AsaasSubscription => ({
  id,
  customer: `cus_${id}`,
  value,
  cycle,
  status: "ACTIVE",
  discount: { value: 0, dueDateLimitDays: 0, type: "FIXED" },
  deleted: false,
  ...overrides,
});
const charge = (
  id: string,
  subscriptionId: string | null,
  dueDate: string,
  value: number,
  overrides: Partial<AsaasPayment> = {},
): AsaasPayment => ({
  id,
  customer: "cus_1",
  subscription: subscriptionId,
  value,
  originalValue: null,
  status: "RECEIVED",
  dueDate,
  originalDueDate: dueDate,
  paymentDate: dueDate,
  clientPaymentDate: dueDate,
  deleted: false,
  refunds: null,
  ...overrides,
});

describe("Asaas keys", () => {
  const body = "000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6Ojk5";

  it("tells production, Sandbox and older keys apart", () => {
    expect(parseAsaasKey(` $aact_prod_${body} `, { allowTest: false })).toEqual({
      key: `$aact_prod_${body}`,
      livemode: true,
      hint: "$aact_prod_…Ojk5",
    });
    expect(parseAsaasKey(`$aact_hmlg_${body}`, { allowTest: true }).livemode).toBe(false);
    expect(parseAsaasKey(`$aact_${body}`, { allowTest: false })).toEqual({
      key: `$aact_${body}`,
      livemode: null,
      hint: "$aact_…Ojk5",
    });
  });

  it("gives back the $ of a key pasted without it", () => {
    expect(parseAsaasKey(`aact_prod_${body}`, { allowTest: false }).key).toBe(`$aact_prod_${body}`);
  });

  it("refuses Sandbox keys unless test keys are allowed, and other keys", () => {
    expect(() => parseAsaasKey(`$aact_hmlg_${body}`, { allowTest: false })).toThrow(/Sandbox/);
    expect(() => parseAsaasKey("rk_live_AbCdEfGhIjKlMnOp", { allowTest: true })).toThrow(
      /another payment provider/,
    );
    expect(() => parseAsaasKey("mrr_AbCdEfGhIjKlMnOp", { allowTest: true })).toThrow(
      /another payment provider/,
    );
    expect(() => parseAsaasKey("$aact_prod_short", { allowTest: true })).toThrow(/\$aact_/);
    expect(() => parseAsaasKey("", { allowTest: true })).toThrow(/\$aact_/);
  });
});

describe("Asaas cycles and amounts", () => {
  it("end whole calendar months later, or after days for weekly cycles", () => {
    expect(cycleEnd(at("2026-01-31"), 1)).toBe(at("2026-02-28"));
    expect(cycleEnd(at("2026-03-15"), 12)).toBe(at("2027-03-15"));
    expect(cycleEnd(at("2026-03-15"), 3)).toBe(at("2026-06-15"));
    expect(cycleEnd(at("2026-03-01"), 7 / AVERAGE_MONTH_DAYS)).toBeCloseTo(at("2026-03-08"), 6);
  });

  it("take the discount off as granted, fixed or in percent", () => {
    expect(discountedValue(subscription("a", 100, "MONTHLY"))).toBe(10000);
    const fixed = { value: 10, type: "FIXED" as const, dueDateLimitDays: 0 };
    expect(discountedValue(subscription("a", 100, "MONTHLY", { discount: fixed }))).toBe(9000);
    const percent = { value: 25, type: "PERCENTAGE" as const, dueDateLimitDays: 3 };
    expect(discountedValue(subscription("a", 100, "MONTHLY", { discount: percent }))).toBe(7500);
    const more = { value: 150, type: "FIXED" as const, dueDateLimitDays: 0 };
    expect(discountedValue(subscription("a", 100, "MONTHLY", { discount: more }))).toBe(0);
  });

  it("value a paid charge without interest and fines", () => {
    expect(chargeAmount(charge("p", "s", "2026-10-01", 99.9))).toBeCloseTo(9990, 6);
    // Paid late: 102.50 with interest and a fine, 100 charged.
    expect(chargeAmount(charge("p", "s", "2026-10-01", 102.5, { originalValue: 100 }))).toBe(10000);
    // Paid early with a discount of 10.
    expect(chargeAmount(charge("p", "s", "2026-10-01", 90, { originalValue: 100 }))).toBe(9000);
  });

  it("read charges as far back as a charge can still cover a subscription", () => {
    // A monthly charge due after September 10 still covers October 24, with a day to spare.
    expect(coverageStart(1, NOW)).toBe("2026-09-09");
    expect(coverageStart(12, NOW)).toBe("2025-10-09");
  });
});

describe("Asaas MRR", () => {
  const subscriptions = [
    subscription("sub_monthly", 49.9, "MONTHLY"),
    subscription("sub_yearly", 1200, "YEARLY", { customer: "cus_sub_monthly" }),
    subscription("sub_weekly", 10, "WEEKLY"),
    subscription("sub_late", 30, "MONTHLY"),
    subscription("sub_unpaid", 100, "MONTHLY"),
    subscription("sub_lapsed", 100, "MONTHLY"),
    subscription("sub_free", 100, "MONTHLY", {
      discount: { value: 100, type: "PERCENTAGE", dueDateLimitDays: 0 },
    }),
    subscription("sub_odd", 100, "DAILY"),
    subscription("sub_inactive", 100, "MONTHLY", { status: "INACTIVE" }),
    subscription("sub_removed", 100, "MONTHLY", { deleted: true }),
  ];
  const charges = [
    charge("pay_m1", "sub_monthly", "2026-09-10", 49.9),
    charge("pay_m2", "sub_monthly", "2026-10-10", 49.9, { status: "CONFIRMED" }),
    charge("pay_m3", "sub_monthly", "2026-11-10", 49.9, { status: "PENDING", paymentDate: null }),
    charge("pay_y", "sub_yearly", "2026-04-02", 1200),
    charge("pay_w", "sub_weekly", "2026-10-20", 10),
    // Paid for September 15 to October 15, so within the two weeks after it.
    charge("pay_late", "sub_late", "2026-09-15", 30),
    charge("pay_unpaid", "sub_unpaid", "2026-10-01", 100, { status: "OVERDUE", paymentDate: null }),
    // Paid for August, and nothing since.
    charge("pay_lapsed", "sub_lapsed", "2026-08-01", 100),
    charge("pay_free", "sub_free", "2026-10-05", 0),
    charge("pay_refunded", "sub_inactive", "2026-10-05", 100, { status: "REFUNDED" }),
  ];

  it("counts active subscriptions that a paid charge covers, less discounts", () => {
    const result = asaasMrr(subscriptions, charges, NOW);
    const monthly = 4990 + 120000 / 12 + (1000 * AVERAGE_MONTH_DAYS) / 7 + 3000;
    expect(result.byCurrency.brl).toBeCloseTo(monthly, 6);
    expect(result.subscriptionIds).toEqual([
      "sub_monthly",
      "sub_yearly",
      "sub_weekly",
      "sub_late",
      "sub_free",
    ]);
    // sub_monthly and sub_yearly belong to the same customer; sub_free is worth nothing.
    expect(result.customers).toBe(3);
    // Unpaid, lapsed, and on a cycle Asaas does not document.
    expect(result.skippedItems).toBe(3);
  });

  it("counts a subscription until two weeks after its paid cycle ends", () => {
    const late = [subscription("s", 30, "MONTHLY")];
    const paid = [charge("p", "s", "2026-09-10", 30)];
    const end = at("2026-10-10") + GRACE;
    expect(paidUp(late, paid, new Date((end - 1) * 1000)).has("s")).toBe(true);
    expect(paidUp(late, paid, new Date(end * 1000)).has("s")).toBe(false);
    // Paid ahead of a first due date still to come.
    const ahead = [charge("p", "s", "2026-11-01", 30)];
    expect(paidUp(late, ahead, NOW).has("s")).toBe(true);
  });

  it("counts nothing without active subscriptions", () => {
    expect(asaasMrr([], charges, NOW)).toEqual({
      byCurrency: {},
      customers: 0,
      subscriptionIds: [],
      skippedItems: 0,
    });
  });
});

describe("Asaas history", () => {
  it("spreads each paid subscription charge over its cycle from its due date", () => {
    const subscriptions = [
      subscription("sub_monthly", 50, "MONTHLY"),
      subscription("sub_yearly", 1200, "YEARLY", { status: "INACTIVE" }),
    ];
    const lines = asaasServiceLines(
      [
        charge("a", "sub_monthly", "2026-08-10", 50),
        charge("b", "sub_monthly", "2026-09-10", 52, { originalValue: 50 }),
        charge("c", "sub_yearly", "2026-01-20", 1200),
        charge("d", "sub_monthly", "2026-10-10", 50, { status: "REFUNDED" }),
        charge("e", "sub_gone", "2026-09-01", 99),
        charge("f", null, "2026-09-01", 99),
      ],
      subscriptions,
    );
    expect(lines).toHaveLength(3);
    expect(mrrAt(lines, at("2026-08-31"))).toEqual({ brl: 5000 + 10000 });
    expect(mrrAt(lines, at("2026-09-30"))).toEqual({ brl: 5000 + 10000 });
    expect(mrrAt(lines, at("2026-10-15"))).toEqual({ brl: 10000 });
    expect(mrrAt(lines, at("2027-01-20"))).toEqual({});
  });
});

describe("Asaas payments", () => {
  const window = { since: at("2026-10-01"), before: at("2026-11-01") };
  const read = (payments: AsaasPayment[]) => asaasPayments(payments, window.since, window.before);

  it("counts paid charges at what was paid, by kind", () => {
    const listed = read([
      charge("pay_sub", "sub_1", "2026-10-05", 49.9),
      charge("pay_one", null, "2026-10-06", 100, {
        status: "CONFIRMED",
        paymentDate: "2026-10-07",
      }),
      charge("pay_link", null, "2026-10-08", 30, { paymentLink: "link_1" }),
    ]);
    expect(listed).toEqual([
      {
        id: "pay_sub",
        at: at("2026-10-05"),
        fingerprint: "RECEIVED:4990:0",
        value: { currency: "brl", amount: expect.closeTo(4990, 6) },
        kind: "subscription",
      },
      {
        id: "pay_one",
        at: at("2026-10-07"),
        fingerprint: "CONFIRMED:10000:0",
        value: { currency: "brl", amount: 10000 },
        kind: "one_time",
      },
      {
        id: "pay_link",
        at: at("2026-10-08"),
        fingerprint: "RECEIVED:3000:0",
        value: { currency: "brl", amount: 3000 },
        kind: "one_time",
      },
    ]);
  });

  it("takes off refunds done or under way, and nothing once refunded or charged back", () => {
    const done = { status: "DONE", value: 20 };
    const pending = { status: "PENDING", value: 10 };
    const cancelled = { status: "CANCELLED", value: 50 };
    expect(refundedAmount(charge("p", null, "2026-10-01", 100, { refunds: [done, pending] }))).toBe(
      3000,
    );
    const listed = read([
      charge("partial", null, "2026-10-02", 100, { refunds: [done, cancelled] }),
      charge("refunding", null, "2026-10-03", 100, {
        status: "REFUND_IN_PROGRESS",
        refunds: [pending],
      }),
      charge("requested", null, "2026-10-04", 100, { status: "REFUND_REQUESTED" }),
      charge("refunded", "sub_1", "2026-10-05", 100, { status: "REFUNDED", refunds: [done] }),
      charge("disputed", null, "2026-10-06", 100, { status: "CHARGEBACK_DISPUTE" }),
      charge("won", null, "2026-10-07", 100, { status: "AWAITING_CHARGEBACK_REVERSAL" }),
    ]);
    expect(Object.fromEntries(listed.map((p) => [p.id, p.value?.amount]))).toEqual({
      partial: 8000,
      refunding: 9000,
      requested: 0,
      refunded: 0,
      disputed: 0,
      won: 10000,
    });
    expect(listed.find((p) => p.id === "partial")?.fingerprint).toBe("RECEIVED:10000:2000");
  });

  it("leaves out unpaid charges, cash receipts, transfers, removed charges and other days", () => {
    const listed = read([
      charge("pending", null, "2026-10-10", 100, { status: "PENDING", paymentDate: null }),
      charge("cash", null, "2026-10-10", 100, { status: "RECEIVED_IN_CASH" }),
      charge("pix_in", null, "2026-10-10", 5000, {
        description: "Cobrança criada automaticamente a partir de Pix recebido.",
      }),
      charge("ted_in", null, "2026-10-10", 5000, {
        description: "Cobrança gerada automaticamente a partir de TED recebido.",
      }),
      charge("removed", null, "2026-10-10", 100, { deleted: true }),
      charge("september", null, "2026-09-30", 100),
      charge("november", null, "2026-11-01", 100),
      charge("qr", null, "2026-10-11", 15, {
        pixQrCodeId: "QR1",
        description: "Cobrança criada automaticamente a partir de Pix recebido.",
      }),
    ]);
    expect(listed.map((payment) => payment.id)).toEqual(["qr"]);
  });

  it("tells transfers into the account from sales", () => {
    const pix = { description: "Charge automatically created from a received Pix." };
    expect(isReceivedTransfer(charge("a", null, "2026-10-01", 1, pix))).toBe(true);
    expect(isReceivedTransfer(charge("b", "sub_1", "2026-10-01", 1, pix))).toBe(false);
    expect(isReceivedTransfer(charge("c", null, "2026-10-01", 1, { description: "Plano" }))).toBe(
      false,
    );
  });

  it("dates a paid charge by its payment date, or when the customer paid", () => {
    const listed = asaasPayments(
      [charge("p", null, "2026-10-01", 10, { paymentDate: null, clientPaymentDate: "2026-10-02" })],
      0,
      null,
    );
    expect(listed[0]?.at).toBe(at("2026-10-02"));
  });
});

/** Stubs fetch with a handler in the shape of the fake servers', recording the requests. */
function stubFetch(
  handle: (
    url: URL,
    request: { method: string; headers: Record<string, string> },
    response: { writeHead: (code: number) => void; end: (text: string) => void },
  ) => unknown,
  requests: URL[],
) {
  vi.stubGlobal("fetch", async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push(url);
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    );
    let status = 500;
    let body = "";
    handle(
      url,
      { method: init?.method ?? "GET", headers },
      {
        writeHead: (code) => {
          status = code;
        },
        end: (text) => {
          body = text;
        },
      },
    );
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  });
}

// The adapter end to end against the fake server the browser tests use.
describe("Asaas adapter", () => {
  const requests: URL[] = [];
  const rates = new Map([["brl", 5]]);
  const options = { allowTest: true, now: new Date(), history: true };

  beforeEach(() => {
    requests.length = 0;
    vi.stubEnv("ASAAS_API_BASE", "http://127.0.0.1:3011/asaas");
    stubFetch(handleAsaas, requests);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("values the paid-up subscriptions, with the history", async () => {
    const reading = await asaas.read(ASAAS.one, false, options);
    expect(reading).toMatchObject({
      livemode: false,
      customers: 2,
      skippedItems: 1,
      historyNote: null,
    });
    expect(reading.byCurrency.brl).toBeCloseTo(28_990, 6);
    expect(toUsdCents(reading.byCurrency, rates)).toBe(5_798);
    expect([...reading.subscriptionIds].sort()).toEqual([
      "sub_harborMonthly",
      "sub_harborQuarterly",
      "sub_harborYearly",
    ]);
    const lines = reading.lines!;
    const now = Math.floor(options.now.getTime() / 1000);
    expect(toUsdCents(mrrAt(lines, now), rates)).toBe(5_798);
    expect(toUsdCents(mrrAt(lines, now - 30 * DAY), rates)).toBe(5_798);
    expect(monthEnds(options.now).map(({ at }) => toUsdCents(mrrAt(lines, at), rates))).toEqual([
      ...Array(6).fill(2_798),
      1_998,
      3_798,
      ...Array(4).fill(5_798),
    ]);
    // Every request names the application, and the key is never in the address.
    expect(requests.every((url) => !url.href.includes("aact"))).toBe(true);
  });

  it("reads the same MRR without the history, from the charges that can cover now", async () => {
    const light = await asaas.read(ASAAS.one, false, { ...options, history: false });
    expect(light).toMatchObject({ customers: 2, skippedItems: 1, lines: null, historyNote: null });
    expect(light.byCurrency.brl).toBeCloseTo(28_990, 6);
    const due = requests.filter((url) => url.searchParams.has("dueDate[ge]"));
    // The monthly cycles first, then back to the yearly one for the overdue subscription.
    expect(due.length).toBeGreaterThanOrEqual(2);
    expect(due[0].searchParams.has("dueDate[le]")).toBe(false);
    expect(due.at(-1)!.searchParams.get("dueDate[le]")).not.toBeNull();
  });

  it("refuses a key with full access, and one of the other environment", async () => {
    await expect(asaas.read(ASAAS.wide, false, options)).rejects.toThrow(
      /can read more than subscriptions and charges/,
    );
    await expect(asaas.read(ASAAS.one, true, options)).rejects.toThrow(/other Asaas environment/);
    await expect(
      asaas.payments(ASAAS.wide, false, {
        allowTest: true,
        since: 0,
        before: null,
        maxPages: 10,
        stored: () => null,
      }),
    ).rejects.toThrow(/can read more than/);
  });

  it("lists paid charges less refunds, and leaves out transfers and cash", async () => {
    const read = await asaas.payments(ASAAS.one, false, {
      allowTest: true,
      since: Math.floor(Date.now() / 1000) - 20 * DAY,
      before: null,
      maxPages: 10,
      stored: () => null,
    });
    expect(read.complete).toBe(true);
    const byId = Object.fromEntries(read.payments.map((payment) => [payment.id, payment]));
    expect(byId.pay_link).toMatchObject({ value: { amount: 20_000 }, kind: "one_time" });
    expect(byId.pay_partial).toMatchObject({ value: { amount: 10_000 }, kind: "one_time" });
    expect(byId.pay_refunded).toMatchObject({ value: { amount: 0 } });
    expect(byId.pay_card).toMatchObject({ value: { amount: 6_000 } });
    expect(byId.pay_pixIn).toBeUndefined();
    expect(byId.pay_cash).toBeUndefined();
    for (const payment of read.payments)
      if (payment.id.startsWith("pay_monthly")) expect(payment.kind).toBe("subscription");
  });

  it("reads all time back to the first payment", async () => {
    const read = await asaas.payments(ASAAS.one, false, {
      allowTest: true,
      since: 0,
      before: null,
      maxPages: 10,
      stored: () => null,
    });
    expect(read.complete).toBe(true);
    // 14 monthly, 1 yearly, 2 quarterly, 6 ended, and 4 one-time charges.
    expect(read.payments).toHaveLength(27);
  });
});

describe("Asaas windows of paid charges", () => {
  const requests: URL[] = [];
  // 450 charges before the window's end: five a day for the last 30 days, then one a week.
  const END = at("2026-10-01");
  const daysBack = [
    ...Array.from({ length: 150 }, (_, k) => 1 + Math.floor(k / 5)),
    ...Array.from({ length: 300 }, (_, k) => 32 + 7 * k),
  ];
  const paidDays = daysBack.map((k) => new Date((END - k * DAY) * 1000).toISOString().slice(0, 10));
  const handle = (
    url: URL,
    _request: unknown,
    response: { writeHead: (code: number) => void; end: (text: string) => void },
  ) => {
    const ge = url.searchParams.get("paymentDate[ge]")!;
    const le = url.searchParams.get("paymentDate[le]")!;
    // Oldest first, unlike most providers' lists.
    const items = paidDays
      .map((day, index) => ({ id: `pay_${index}`, value: 1, status: "RECEIVED", paymentDate: day }))
      .filter((payment) => payment.paymentDate >= ge && payment.paymentDate <= le)
      .reverse();
    const offset = Number(url.searchParams.get("offset"));
    const data = items.slice(offset, offset + 100);
    response.writeHead(200);
    response.end(
      JSON.stringify({ data, hasMore: offset + 100 < items.length, totalCount: items.length }),
    );
  };

  beforeEach(() => {
    requests.length = 0;
    vi.stubEnv("ASAAS_API_BASE", "http://127.0.0.1:3011/asaas");
    stubFetch(handle, requests);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads a window whole when its charges fit in the pages allowed", async () => {
    const read = await fetchPaidWindow("key", false, 0, END, 5);
    expect(read).toMatchObject({ complete: true });
    expect(new Set(read.payments.map((payment) => payment.id)).size).toBe(450);
    expect(requests).toHaveLength(5);
  });

  it("goes back 31 days at a time when they do not, and says from where it is complete", async () => {
    const read = await fetchPaidWindow("key", false, 0, END, 4);
    expect(read.complete).toBe(false);
    // The first page counted 450 charges; two slices fitted in the three pages left.
    expect(read.from).toBe(END - 62 * DAY);
    expect(read.payments).toHaveLength(155);
    expect(read.payments.every((payment) => dateStart(payment.paymentDate)! >= read.from!)).toBe(
      true,
    );
    // The next read covers the rest of the window.
    const next = await fetchPaidWindow("key", false, 0, read.from!, 4);
    expect(next).toMatchObject({ complete: true });
    expect(next.payments).toHaveLength(295);
  });
});
