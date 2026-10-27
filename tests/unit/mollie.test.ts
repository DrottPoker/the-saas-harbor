import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOLLIE, handleMollie } from "../e2e/fake-mollie.mjs";
import { splitAccountKey } from "../../src/lib/revenue/account-key";
import { monthEnds, mrrAt } from "../../src/lib/revenue/history";
import { AVERAGE_MONTH_DAYS, toUsdCents } from "../../src/lib/revenue/money";
import { nextCursor, requireReadOnly } from "../../src/lib/revenue/mollie/client";
import { mollie } from "../../src/lib/revenue/mollie/index";
import { parseMollieKey, parseMollieProfile } from "../../src/lib/revenue/mollie/key";
import {
  earned,
  mollieMrr,
  mollieServiceLines,
  paidAhead,
  paidAheadWindowStart,
  parseInterval,
  shift,
  type MolliePayment,
  type MollieSubscription,
} from "../../src/lib/revenue/mollie/mrr";
import { molliePayments } from "../../src/lib/revenue/mollie/payments";

const DAY = 86_400;
const at = (year: number, month: number, day = 1) => Date.UTC(year, month, day) / 1000;
const NOW = at(2026, 9, 24) + 12 * 3_600;
const time = (seconds: number) =>
  new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
const eur = (value: string) => ({ currency: "EUR", value });
const usd = (value: string) => ({ currency: "USD", value });

const subscription = (
  id: string,
  overrides: Partial<MollieSubscription> = {},
): MollieSubscription => ({
  id,
  status: "active",
  amount: eur("10.00"),
  interval: "1 month",
  startDate: "2026-01-05",
  customerId: `cst_${id}`,
  ...overrides,
});

const payment = (id: string, seconds: number, overrides: Partial<MolliePayment> = {}) =>
  ({
    id,
    status: "paid",
    createdAt: time(seconds),
    amount: eur("10.00"),
    amountRefunded: eur("0.00"),
    sequenceType: "oneoff",
    customerId: null,
    subscriptionId: null,
    ...overrides,
  }) satisfies MolliePayment;

describe("Mollie tokens", () => {
  const token = "access_Wwvu7egPcJLLJ9Kb7J632x8wJ2zMeJ";

  it("takes the profile from an ID or a pasted address", () => {
    expect(parseMollieProfile(" pfl_QkEhN94Ba ")).toBe("pfl_QkEhN94Ba");
    expect(
      parseMollieProfile(
        "https://my.mollie.com/dashboard/org_1234/settings/profiles/pfl_QkEhN94Ba",
      ),
    ).toBe("pfl_QkEhN94Ba");
    expect(() => parseMollieProfile("")).toThrow(/starts with pfl_/);
    expect(() => parseMollieProfile("pfl_")).toThrow(/starts with pfl_/);
  });

  it("keeps the profile and the token together, live unless test keys are allowed", () => {
    const parsed = parseMollieKey(
      { key: ` ${token} `, account: "pfl_QkEhN94Ba" },
      { allowTest: false },
    );
    expect(parsed).toEqual({
      key: `pfl_QkEhN94Ba:${token}`,
      livemode: true,
      hint: "pfl_QkEhN94Ba · access_…zMeJ",
    });
    expect(splitAccountKey(parsed.key)).toEqual({ account: "pfl_QkEhN94Ba", key: token });
    expect(
      parseMollieKey({ key: token, account: "pfl_QkEhN94Ba" }, { allowTest: true }).livemode,
    ).toBeNull();
  });

  it("refuses API keys, which have full access, and other providers' keys", () => {
    const parse = (key: string) =>
      parseMollieKey({ key, account: "pfl_QkEhN94Ba" }, { allowTest: true });
    expect(() => parse("live_dHar4XY7LxsDOtmnkVtjNVWXLSlXsM")).toThrow(/Mollie API key/);
    expect(() => parse("test_dHar4XY7LxsDOtmnkVtjNVWXLSlXsM")).toThrow(/Mollie API key/);
    expect(() => parse(`rk_live_${"a".repeat(24)}`)).toThrow(/another payment provider/);
    expect(() => parse("access_short")).toThrow(/starts with access_/);
    expect(() => parse("refresh_Wwvu7egPcJLLJ9Kb7J632x8wJ2zMeJ")).toThrow(/starts with access_/);
    expect(() => parseMollieKey({ key: token, account: "" }, { allowTest: true })).toThrow(/pfl_/);
  });
});

describe("Mollie permissions", () => {
  const permissions = (...granted: string[]) =>
    [
      "payments.read",
      "payments.write",
      "subscriptions.read",
      "subscriptions.write",
      "refunds.read",
      "organizations.read",
    ].map((id) => ({ id, granted: granted.includes(id) }));

  it("accept a token that only reads, with payments and subscriptions", () => {
    expect(() =>
      requireReadOnly(permissions("payments.read", "subscriptions.read", "refunds.read")),
    ).not.toThrow();
  });

  it("refuse a token that can write, or cannot read what verification needs", () => {
    expect(() =>
      requireReadOnly(permissions("payments.read", "subscriptions.read", "payments.write")),
    ).toThrow(/can do more than read, for example payments.write/);
    expect(() => requireReadOnly(permissions("payments.read"))).toThrow(
      /cannot read subscriptions\./,
    );
    expect(() => requireReadOnly(permissions())).toThrow(/cannot read payments or subscriptions/);
  });
});

describe("Mollie pages", () => {
  it("take the next cursor from Mollie's link, and stop without one", () => {
    expect(
      nextCursor({
        _links: { next: { href: "https://api.mollie.com/v2/payments?from=tr_SDkzMggpvx&limit=5" } },
      }),
    ).toBe("tr_SDkzMggpvx");
    expect(nextCursor({ _links: { next: null } })).toBeNull();
    expect(nextCursor({})).toBeNull();
    expect(nextCursor({ _links: { next: { href: "not a link" } } })).toBeNull();
  });
});

describe("Mollie intervals", () => {
  it("read days, weeks and months, and nothing else", () => {
    expect(parseInterval("1 month")).toEqual({ unit: "month", count: 1 });
    expect(parseInterval("3 months")).toEqual({ unit: "month", count: 3 });
    expect(parseInterval("14 days")).toEqual({ unit: "day", count: 14 });
    expect(parseInterval("2 weeks")).toEqual({ unit: "week", count: 2 });
    expect(parseInterval("1 year")).toBeNull();
    expect(parseInterval("0 months")).toBeNull();
    expect(parseInterval("monthly")).toBeNull();
  });

  it("move by calendar months, ending on the last day of a shorter month", () => {
    const month = parseInterval("1 month")!;
    expect(shift(at(2026, 0, 31), month)).toBe(at(2026, 1, 28));
    expect(shift(at(2026, 2, 15), parseInterval("3 months")!, -1)).toBe(at(2025, 11, 15));
    expect(shift(at(2026, 0, 1), parseInterval("2 weeks")!)).toBe(at(2026, 0, 15));
    expect(shift(at(2026, 0, 1), parseInterval("10 days")!)).toBe(at(2026, 0, 11));
  });
});

describe("Mollie payment values", () => {
  it("take out the VAT that lines name, and refunds at the same untaxed share", () => {
    const taxed = payment("tr_1", NOW, {
      amount: eur("121.00"),
      amountRefunded: eur("60.50"),
      lines: [{ vatAmount: eur("21.00") }],
    });
    expect(earned(taxed)).toBeCloseTo(5000, 6);
    expect(earned(payment("tr_2", NOW, { amountChargedBack: eur("10.00") }))).toBe(0);
    expect(earned(payment("tr_3", NOW, { amountRefunded: eur("15.00") }))).toBe(0);
    expect(earned(payment("tr_4", NOW, { amount: eur("0.00") }))).toBe(0);
    expect(earned(payment("tr_5", NOW, { amount: { currency: "JPY", value: "1200" } }))).toBe(1200);
  });
});

describe("Mollie MRR", () => {
  it("normalizes active subscriptions to a month, per customer and currency", () => {
    const result = mollieMrr(
      [
        subscription("sub_a", { amount: eur("30.00"), interval: "3 months" }),
        subscription("sub_b", { amount: eur("12.00"), customerId: "cst_sub_a" }),
        subscription("sub_c", { amount: usd("14.00"), interval: "14 days" }),
        subscription("sub_d", { amount: usd("120.00"), interval: "12 months" }),
        subscription("sub_suspended", { status: "suspended" }),
        subscription("sub_canceled", { status: "canceled" }),
        subscription("sub_pending", { status: "pending" }),
        subscription("sub_completed", { status: "completed" }),
      ],
      [],
      NOW,
    );
    expect(result.byCurrency.eur).toBe(1000 + 1200);
    expect(result.byCurrency.usd).toBeCloseTo(1400 * (AVERAGE_MONTH_DAYS / 14) + 1000, 6);
    expect(result).toMatchObject({
      customers: 3,
      subscriptionIds: ["sub_a", "sub_b", "sub_c", "sub_d"],
      skippedItems: 0,
    });
  });

  it("skips a subscription whose interval cannot be read, and claims it", () => {
    const result = mollieMrr([subscription("sub_odd", { interval: "1 fortnight" })], [], NOW);
    expect(result).toEqual({
      byCurrency: {},
      customers: 0,
      subscriptionIds: ["sub_odd"],
      skippedItems: 1,
    });
  });

  it("counts a subscription that starts later only when its first period was paid ahead", () => {
    const start = at(2026, 10, 20);
    const later = (id: string, customerId: string) =>
      subscription(id, { startDate: day(start), customerId, amount: eur("20.00") });
    const first = (id: string, customerId: string, seconds: number, amount = "20.00") =>
      payment(id, seconds, { sequenceType: "first", customerId, amount: eur(amount) });
    const subscriptions = [
      later("sub_paid", "cst_paid"),
      later("sub_mandate", "cst_mandate"),
      later("sub_old", "cst_old"),
      later("sub_refunded", "cst_refunded"),
      later("sub_other", "cst_other"),
      later("sub_none", "cst_none"),
      later("sub_tomorrow", "cst_tomorrow"),
    ];
    const payments = [
      first("tr_paid", "cst_paid", at(2026, 9, 20) + 3_600, "24.00"),
      first("tr_mandate", "cst_mandate", at(2026, 9, 20), "0.01"),
      // More than a month and a week before the start.
      first("tr_old", "cst_old", at(2026, 9, 12)),
      { ...first("tr_refunded", "cst_refunded", at(2026, 9, 20)), amountRefunded: eur("20.00") },
      first("tr_other", "cst_someone", at(2026, 9, 20)),
    ];
    subscriptions[6] = subscription("sub_tomorrow", {
      startDate: day(NOW + DAY),
      customerId: "cst_tomorrow",
    });
    const result = mollieMrr(subscriptions, payments, NOW);
    expect(result).toMatchObject({
      byCurrency: { eur: 2000 },
      customers: 1,
      subscriptionIds: ["sub_paid"],
    });
    // A subscription that starts today is due, so it counts.
    const today = subscription("sub_today", { startDate: day(NOW) });
    expect(mollieMrr([today], [], NOW).subscriptionIds).toEqual(["sub_today"]);
  });

  it("matches each first payment to one subscription, the latest that qualifies", () => {
    const subscriptions = [
      subscription("sub_one", { startDate: "2026-11-01", customerId: "cst_a" }),
      subscription("sub_two", { startDate: "2026-11-02", customerId: "cst_a" }),
    ];
    const payments = [
      payment("tr_first", at(2026, 9, 2), { sequenceType: "first", customerId: "cst_a" }),
      payment("tr_later", at(2026, 9, 10), { sequenceType: "first", customerId: "cst_a" }),
    ];
    const found = paidAhead(subscriptions, payments);
    expect(found.get("sub_one")?.id).toBe("tr_later");
    expect(found.get("sub_two")?.id).toBe("tr_first");
  });

  it("reads payments back an interval and a week before the soonest start", () => {
    const subscriptions = [
      subscription("sub_month", { startDate: "2026-11-10" }),
      subscription("sub_year", { startDate: "2027-08-01", interval: "12 months" }),
      subscription("sub_far", { startDate: "2027-03-01" }),
      subscription("sub_started", { startDate: "2026-01-01" }),
      subscription("sub_canceled", { startDate: "2026-11-01", status: "canceled" }),
    ];
    // A yearly one starting in ten months may have been paid ahead two months ago.
    expect(paidAheadWindowStart(subscriptions, NOW)).toBe(at(2026, 6, 25));
    expect(paidAheadWindowStart([subscriptions[0]], NOW)).toBe(at(2026, 9, 3));
    expect(paidAheadWindowStart([subscriptions[3]], NOW)).toBeNull();
    // One starting further ahead than an interval and a week cannot have been paid yet.
    expect(paidAheadWindowStart([subscriptions[2]], NOW)).toBeNull();
  });
});

describe("Mollie history", () => {
  const subscriptions = [
    subscription("sub_m", { interval: "1 month", startDate: "2026-01-31" }),
    subscription("sub_y", {
      interval: "12 months",
      amount: usd("120.00"),
      startDate: "2027-03-15",
      customerId: "cst_y",
    }),
  ];
  const recurring = (id: string, seconds: number, overrides: Partial<MolliePayment> = {}) =>
    payment(id, seconds, {
      sequenceType: "recurring",
      subscriptionId: "sub_m",
      customerId: "cst_sub_m",
      ...overrides,
    });

  it("covers one calendar interval from each paid payment of a subscription", () => {
    const lines = mollieServiceLines(
      [
        recurring("tr_jan", at(2026, 0, 31)),
        recurring("tr_feb", at(2026, 1, 28)),
        recurring("tr_mar", at(2026, 2, 31), { amountRefunded: eur("10.00") }),
        recurring("tr_failed", at(2026, 3, 30), { status: "failed" }),
        payment("tr_once", at(2026, 2, 5), { amount: eur("99.00") }),
        recurring("tr_unknown", at(2026, 2, 5), { subscriptionId: "sub_gone" }),
      ],
      subscriptions,
    );
    expect(lines).toEqual([
      { start: at(2026, 0, 31), end: at(2026, 1, 28), currency: "eur", monthly: 1000 },
      { start: at(2026, 1, 28), end: at(2026, 2, 28), currency: "eur", monthly: 1000 },
    ]);
    // The last instants of January and February are covered.
    expect(mrrAt(lines, at(2026, 1, 1) - 1)).toEqual({ eur: 1000 });
    expect(mrrAt(lines, at(2026, 2, 1) - 1)).toEqual({ eur: 1000 });
  });

  it("covers the time until a subscription starts from the first payment that paid ahead", () => {
    const paidAt = at(2026, 2, 15) + 600;
    const lines = mollieServiceLines(
      [
        payment("tr_first", paidAt, {
          sequenceType: "first",
          customerId: "cst_y",
          amount: usd("150.00"),
        }),
      ],
      subscriptions,
    );
    // A setup fee on top of the price is not recurring.
    expect(lines).toEqual([
      { start: paidAt, end: at(2027, 2, 15), currency: "usd", monthly: 1000 },
    ]);
  });
});

describe("Mollie revenue", () => {
  it("lists paid payments of the window after refunds, with their kind", () => {
    const payments = molliePayments(
      [
        payment("tr_once", NOW - DAY, {
          amount: eur("121.00"),
          lines: [{ vatAmount: eur("21.00") }],
        }),
        payment("tr_sub", NOW - 2 * DAY, { subscriptionId: "sub_a", sequenceType: "recurring" }),
        payment("tr_first", NOW - 3 * DAY, { sequenceType: "first", customerId: "cst_a" }),
        payment("tr_own", NOW - 4 * DAY, { sequenceType: "recurring", customerId: "cst_a" }),
        payment("tr_partial", NOW - 5 * DAY, {
          amount: usd("30.00"),
          amountRefunded: usd("10.00"),
        }),
        payment("tr_back", NOW - 6 * DAY, { amountChargedBack: eur("10.00") }),
        payment("tr_failed", NOW - DAY, { status: "failed" }),
        payment("tr_open", NOW - DAY, { status: "open" }),
        payment("tr_authorized", NOW - DAY, { status: "authorized" }),
        payment("tr_new", NOW, {}),
        payment("tr_old", NOW - 30 * DAY, {}),
      ],
      NOW - 10 * DAY,
      NOW,
    );
    const byId = Object.fromEntries(payments.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual([
      "tr_back",
      "tr_first",
      "tr_once",
      "tr_own",
      "tr_partial",
      "tr_sub",
    ]);
    expect(byId.tr_once).toMatchObject({
      at: NOW - DAY,
      value: { currency: "eur", amount: 10_000 },
      kind: "one_time",
      fingerprint: "0.00:0",
    });
    expect(byId.tr_partial).toMatchObject({
      value: { currency: "usd", amount: 2000 },
      fingerprint: "10.00:0",
    });
    expect(byId.tr_back).toMatchObject({ value: { amount: 0 }, fingerprint: "0.00:10.00" });
    for (const id of ["tr_sub", "tr_first", "tr_own"]) expect(byId[id].kind).toBe("subscription");
  });
});

// The adapter end to end against the fake server the browser tests use.
describe("Mollie adapter", () => {
  const base = "http://127.0.0.1:3011/mollie";
  const stored = (token: string) => `${MOLLIE.profile}:${token}`;
  const requests: URL[] = [];

  beforeEach(() => {
    requests.length = 0;
    vi.stubEnv("MOLLIE_API_BASE", base);
    vi.stubGlobal("fetch", async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push(url);
      // Mollie's links to next pages point at Mollie; requests must not follow them.
      if (url.origin !== "http://127.0.0.1:3011") throw new TypeError("fetch failed");
      const headers = Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([name, value]) => [
          name.toLowerCase(),
          value,
        ]),
      );
      let status = 500;
      let body = "";
      const response = {
        writeHead: (code: number) => {
          status = code;
        },
        end: (text: string) => {
          body = text;
        },
      };
      await handleMollie(url, { method: init?.method ?? "GET", headers }, response);
      return new Response(body, { status, headers: { "content-type": "application/hal+json" } });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const options = { allowTest: true, now: new Date(), history: true };
  const rates = new Map([["eur", 0.8]]);

  it("finds the test data, and values subscriptions with the history", async () => {
    const reading = await mollie.read(stored(MOLLIE.tokens.one), null, options);
    expect(reading).toMatchObject({
      livemode: false,
      customers: 3,
      skippedItems: 0,
      historyNote: null,
    });
    expect(reading.byCurrency).toEqual({ eur: 4000, usd: 1000 });
    expect(toUsdCents(reading.byCurrency, rates)).toBe(6000);
    expect([...reading.subscriptionIds].sort()).toEqual([
      "sub_HarborMonthly",
      "sub_HarborQuarter",
      "sub_HarborYearly",
    ]);
    const lines = reading.lines!;
    const now = Math.floor(options.now.getTime() / 1000);
    expect(toUsdCents(mrrAt(lines, now), rates)).toBe(6000);
    expect(toUsdCents(mrrAt(lines, now - 30 * DAY), rates)).toBe(6000);
    expect(monthEnds(options.now).map(({ at }) => toUsdCents(mrrAt(lines, at), rates))).toEqual([
      2500, 2500, 2500, 2500, 2500, 2500, 2500, 5000, 6875, 6875, 6000, 6000,
    ]);
    // Lists went on over several pages, by the cursor Mollie's links give.
    expect(requests.some((url) => url.searchParams.has("from"))).toBe(true);
  });

  it("reads the same MRR without the history", async () => {
    const light = await mollie.read(stored(MOLLIE.tokens.one), false, {
      ...options,
      history: false,
    });
    expect(light).toMatchObject({ livemode: false, lines: null, historyNote: null, customers: 3 });
    expect(light.byCurrency).toEqual({ eur: 4000, usd: 1000 });
  });

  it("refuses a token that can write, live data it cannot reach, and another profile", async () => {
    await expect(mollie.read(stored(MOLLIE.tokens.wide), null, options)).rejects.toThrow(
      /can do more than read, for example payments.write/,
    );
    await expect(mollie.read(stored(MOLLIE.tokens.one), true, options)).rejects.toThrow(
      /limited neither to test mode/,
    );
    await expect(
      mollie.read(stored(MOLLIE.tokens.one), null, { ...options, allowTest: false }),
    ).rejects.toThrow(/limited neither to test mode/);
    await expect(
      mollie.read(`pfl_SomeoneElse:${MOLLIE.tokens.one}`, false, options),
    ).rejects.toThrow(/no website profile with this ID/);
    await expect(
      mollie.read(`${MOLLIE.profile}:access_NotATokenOfThisFake01`, false, options),
    ).rejects.toThrow(/rejected the token/);
  });

  it("lists paid payments after refunds and without VAT", async () => {
    const since = Math.floor(Date.now() / 1000) - 400 * DAY;
    const read = await mollie.payments(stored(MOLLIE.tokens.one), false, {
      allowTest: true,
      since,
      before: null,
      maxPages: 100,
      stored: () => null,
    });
    expect(read.complete).toBe(true);
    const values = Object.fromEntries(read.payments.map((p) => [p.id, p.value]));
    expect(values).toMatchObject({
      tr_HarborMonthly0: { currency: "eur", amount: 2000 },
      tr_HarborQuarter2: { currency: "eur", amount: 6000 },
      tr_HarborYearFirst: { currency: "usd", amount: 12_000 },
      tr_HarborMandate: { currency: "eur", amount: 0 },
      tr_HarborOnce: { currency: "eur", amount: 10_000 },
      tr_HarborPartial: { currency: "usd", amount: 2000 },
      tr_HarborRefunded: { currency: "eur", amount: 0 },
      tr_HarborChargeback: { currency: "usd", amount: 0 },
    });
    expect(values).not.toHaveProperty("tr_HarborFailed");
    expect(values).not.toHaveProperty("tr_HarborOpen");
    const kinds = Object.fromEntries(read.payments.map((p) => [p.id, p.kind]));
    expect(kinds).toMatchObject({
      tr_HarborMonthly0: "subscription",
      tr_HarborYearFirst: "subscription",
      tr_HarborOnce: "one_time",
    });
    expect(requests.every((url) => url.searchParams.get("testmode") !== "false")).toBe(true);
  });

  it("goes on in the next run from the day after the oldest payment it reached", async () => {
    const now = Math.floor(Date.now() / 1000);
    const read = await mollie.payments(stored(MOLLIE.tokens.one), false, {
      allowTest: true,
      since: 0,
      before: null,
      maxPages: 2,
      stored: () => null,
    });
    expect(read.complete).toBe(false);
    expect(read.payments).toHaveLength(8);
    expect(read.from).toBeGreaterThan(now - 120 * DAY);
    expect(read.from! % DAY).toBe(0);
    const older = await mollie.payments(stored(MOLLIE.tokens.one), false, {
      allowTest: true,
      since: 0,
      before: read.from!,
      maxPages: 100,
      stored: () => null,
    });
    expect(older.complete).toBe(true);
    expect(older.payments.every((p) => p.at < read.from!)).toBe(true);
    expect(older.payments.map((p) => p.id)).toContain("tr_HarborMonthly13");
  });
});
