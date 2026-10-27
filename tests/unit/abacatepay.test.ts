import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ABACATEPAY, handleAbacatePay } from "../e2e/fake-abacatepay.mjs";
import { monthEnds, mrrAt } from "../../src/lib/revenue/history";
import { toUsdCents } from "../../src/lib/revenue/money";
import { abacatepay } from "../../src/lib/revenue/abacatepay/index";
import { parseAbacatePayKey } from "../../src/lib/revenue/abacatepay/key";
import {
  abacateCurrency,
  abacateMrr,
  abacateServiceLines,
  abacateSubscribers,
  mrrPoints,
} from "../../src/lib/revenue/abacatepay/mrr";
import { revenuePayments } from "../../src/lib/revenue/abacatepay/payments";

const DAY = 86_400;
const at = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;

// The documented answers of the Public MRR routes.
const mrr = {
  mrr: { currency: "BRL", value: 129900 },
  totalActiveSubscriptions: { currency: "BRL", value: 12 },
};
const mrrByDay = { "2024-01-15": { mrr: 129900 }, "2024-01-16": { mrr: 134900 } };
const revenue = {
  totalRevenue: 8000,
  totalTransactions: 5,
  transactionsPerDay: {
    "2024-01-15": { amount: 5000, count: 3 },
    "2024-01-16": { amount: 3000, count: 2 },
  },
};

describe("AbacatePay tokens", () => {
  it("accepts a Trust MRR token, as live", () => {
    expect(parseAbacatePayKey(" mrr_AbCdEf123456XyZ ")).toEqual({
      key: "mrr_AbCdEf123456XyZ",
      livemode: true,
      hint: "mrr_…6XyZ",
    });
  });

  it("refuses API keys, the public key and other providers' keys", () => {
    expect(() => parseAbacatePayKey("abc_prod_AbCdEf123456")).toThrow(/Trust MRR app/);
    expect(() => parseAbacatePayKey("abc_dev_AbCdEf123456")).toThrow(/can do more than read/);
    expect(() => parseAbacatePayKey("pk_AbCdEf123456")).toThrow(/public key/);
    expect(() => parseAbacatePayKey("sk_live_AbCdEf123456")).toThrow(/another payment provider/);
    expect(() => parseAbacatePayKey("$aact_prod_AbCdEf123456789012345")).toThrow(
      /another payment provider/,
    );
    expect(() => parseAbacatePayKey("mrr_")).toThrow(/starts with mrr_/);
    expect(() => parseAbacatePayKey("something else")).toThrow(/starts with mrr_/);
  });
});

describe("AbacatePay MRR", () => {
  it("takes MRR in centavos and the active subscriptions", () => {
    expect(abacateMrr(mrr)).toEqual({ brl: 129900 });
    expect(abacateCurrency(mrr.mrr)).toBe("brl");
    expect(abacateSubscribers(mrr)).toBe(12);
  });

  it("counts no subscribers without MRR", () => {
    const none = { ...mrr, mrr: { currency: "BRL", value: 0 } };
    expect(abacateMrr(none)).toEqual({});
    expect(abacateSubscribers(none)).toBe(0);
    expect(abacateMrr({})).toEqual({});
    expect(abacateCurrency(null)).toBe("brl");
  });

  it("gives each day's closing MRR as the history", () => {
    const points = mrrPoints({ ...mrrByDay, total: { mrr: 1 }, "2024-01-17": null });
    expect(points).toEqual([
      { at: at("2024-01-15"), value: 129900 },
      { at: at("2024-01-16"), value: 134900 },
    ]);
    const now = new Date((at("2024-01-16") + 3600) * 1000);
    const lines = abacateServiceLines(points, "brl", now);
    expect(mrrAt(lines, at("2024-01-15") + 3600)).toEqual({ brl: 129900 });
    expect(mrrAt(lines, at("2024-01-16") - 1)).toEqual({ brl: 129900 });
    expect(mrrAt(lines, at("2024-01-16") + 2 * 3600)).toEqual({ brl: 134900 });
    expect(mrrAt(lines, at("2024-01-17") + 1800)).toEqual({ brl: 134900 });
    expect(mrrAt(lines, at("2024-01-15") - 1)).toEqual({});
  });
});

describe("AbacatePay revenue", () => {
  it("counts each day as one payment of the store, of unknown kind", () => {
    expect(revenuePayments("store_abc123xyz", revenue, "brl", 0, null)).toEqual([
      {
        id: "store_abc123xyz:2024-01-15",
        at: at("2024-01-15"),
        fingerprint: "5000",
        value: { currency: "brl", amount: 5000 },
        kind: "unknown",
      },
      {
        id: "store_abc123xyz:2024-01-16",
        at: at("2024-01-16"),
        fingerprint: "3000",
        value: { currency: "brl", amount: 3000 },
        kind: "unknown",
      },
    ]);
  });

  it("keeps to the window and leaves out empty days", () => {
    const days = {
      transactionsPerDay: {
        ...revenue.transactionsPerDay,
        "2024-01-17": { amount: 0, count: 0 },
        "not a day": { amount: 100, count: 1 },
      },
    };
    const listed = revenuePayments("s", days, "brl", at("2024-01-16"), at("2024-01-16") + DAY);
    expect(listed.map((payment) => payment.id)).toEqual(["s:2024-01-16"]);
    expect(revenuePayments("s", {}, "brl", 0, null)).toEqual([]);
  });
});

// The adapter end to end against the fake server the browser tests use.
describe("AbacatePay adapter", () => {
  const requests: URL[] = [];
  const rates = new Map([["brl", 5]]);
  const options = { allowTest: false, now: new Date(), history: true };

  beforeEach(() => {
    requests.length = 0;
    vi.stubEnv("ABACATEPAY_API_BASE", "http://127.0.0.1:3011/abacatepay");
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
      const response = {
        writeHead: (code: number) => {
          status = code;
        },
        end: (text: string) => {
          body = text;
        },
      };
      handleAbacatePay(url, { method: init?.method ?? "GET", headers }, response);
      return new Response(body, { status, headers: { "content-type": "application/json" } });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads MRR, subscribers and the daily MRR of the store", async () => {
    const reading = await abacatepay.read(ABACATEPAY.one, true, options);
    expect(reading).toMatchObject({
      livemode: true,
      byCurrency: { brl: 50_000 },
      customers: 4,
      subscriptionIds: ["merchant:store_harborfixture"],
      skippedItems: 0,
      historyNote: null,
    });
    const lines = reading.lines!;
    const now = Math.floor(options.now.getTime() / 1000);
    expect(toUsdCents(mrrAt(lines, now), rates)).toBe(10_000);
    expect(toUsdCents(mrrAt(lines, now - 30 * DAY), rates)).toBe(10_000);
    expect(monthEnds(options.now).map(({ at }) => toUsdCents(mrrAt(lines, at), rates))).toEqual([
      ...Array(6).fill(5_000),
      ...Array(6).fill(10_000),
    ]);
    // Thirteen months of daily MRR take two requests of at most 366 days.
    const ranges = requests.filter((url) => url.pathname.endsWith("/mrr-by-day"));
    expect(ranges).toHaveLength(2);
    for (const url of ranges) {
      const days =
        (at(url.searchParams.get("endDate")!) - at(url.searchParams.get("startDate")!)) / DAY + 1;
      expect(days).toBeLessThanOrEqual(366);
    }
  });

  it("reads MRR alone without the history", async () => {
    const light = await abacatepay.read(ABACATEPAY.one, true, { ...options, history: false });
    expect(light).toMatchObject({ byCurrency: { brl: 50_000 }, customers: 4, lines: null });
    expect(requests.some((url) => url.pathname.endsWith("/mrr-by-day"))).toBe(false);
  });

  it("reads revenue back to the store's first day, a year a request", async () => {
    const read = await abacatepay.payments(ABACATEPAY.one, true, {
      allowTest: false,
      since: 0,
      before: null,
      maxPages: 100,
      stored: () => null,
    });
    expect(read.complete).toBe(true);
    expect(read.payments).toHaveLength(17);
    const total = read.payments.reduce((sum, payment) => sum + (payment.value?.amount ?? 0), 0);
    expect(total).toBe(812_000);
    expect(requests.filter((url) => url.pathname.endsWith("/revenue"))).toHaveLength(2);
  });

  it("asks for a single day with the day before it", async () => {
    const today = at(new Date().toISOString().slice(0, 10));
    const read = await abacatepay.payments(ABACATEPAY.one, true, {
      allowTest: false,
      since: today - 3 * DAY,
      before: today - 2 * DAY,
      maxPages: 1,
      stored: () => null,
    });
    expect(read).toMatchObject({ complete: true });
    expect(read.payments.map((payment) => payment.value?.amount)).toEqual([12_000]);
  });

  it("stops where its requests run out", async () => {
    const read = await abacatepay.payments(ABACATEPAY.one, true, {
      allowTest: false,
      since: 0,
      before: null,
      maxPages: 1,
      stored: () => null,
    });
    expect(read.complete).toBe(false);
    expect(read.from).toBeDefined();
    expect(read.payments.every((payment) => payment.at >= read.from!)).toBe(true);
  });

  it("rejects any other token", async () => {
    await expect(abacatepay.read(ABACATEPAY.wide, true, options)).rejects.toThrow(
      /rejected the token/,
    );
    expect(() => parseAbacatePayKey(ABACATEPAY.wide)).toThrow(/can do more than read/);
  });
});
