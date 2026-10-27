import { createPublicKey, generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPSTORE, handleAppStore } from "../e2e/fake-appstore.mjs";
import { reportQuery, reportText, scopeOf } from "../../src/lib/revenue/appstore/client";
import { appstore } from "../../src/lib/revenue/appstore/index";
import {
  appStoreCredentials,
  appStoreToken,
  parseAppStoreKey,
  TOKEN_LIFETIME,
} from "../../src/lib/revenue/appstore/key";
import {
  appStoreMrr,
  BOM,
  durationMonths,
  historyDates,
  parseReport,
  recentDays,
  snapshotLines,
} from "../../src/lib/revenue/appstore/mrr";
import { firstReportDay, reportDays, salesPayments } from "../../src/lib/revenue/appstore/payments";
import { monthEnds, mrrAt } from "../../src/lib/revenue/history";
import { AVERAGE_MONTH_DAYS, toUsdCents } from "../../src/lib/revenue/money";
import { addDays, coveredFrom, dayOf, dayStart, rereadFrom } from "../../src/lib/revenue/payments";
import type { ListedPayment } from "../../src/lib/revenue/types";

// The adapter reads a report per day, so requests are not spaced out here as in production.
vi.mock("../../src/lib/revenue/http", async (importOriginal) => {
  const http = await importOriginal<typeof import("../../src/lib/revenue/http")>();
  return {
    ...http,
    providerGet: (_provider: string, _name: string, url: URL, headers: Record<string, string>) =>
      fetch(url, { headers, cache: "no-store" }),
  };
});

const DAY = 86_400;
const ISSUER = "57246542-96fe-1a63-e053-0824d011072a";
const pem = (key: KeyObject) => key.export({ format: "pem", type: "pkcs8" }).toString();
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PEM = pem(privateKey);
const input = (key: string, extra = ["2X9R4HXF34", "85012345"]) => ({
  key,
  account: ISSUER,
  extra,
});

describe("App Store keys", () => {
  it("accepts the .p8 file with or without line breaks and its BEGIN and END lines", () => {
    const parsed = parseAppStoreKey(input(PEM));
    expect(parsed.livemode).toBe(true);
    expect(parsed.hint).toBe("2X9R4HXF34 · vendor 85012345");
    // A password field drops the line breaks.
    expect(parseAppStoreKey(input(PEM.replace(/\n/g, ""))).key).toBe(parsed.key);
    const body = PEM.replace(/-----[A-Z ]+-----/g, "");
    expect(parseAppStoreKey(input(body)).key).toBe(parsed.key);
    expect(parseAppStoreKey(input(` ${PEM.replace(/\n/g, "\\n")} `)).key).toBe(parsed.key);
    const [issuer, keyId, vendor, der] = parsed.key.split(":");
    expect([issuer, keyId, vendor]).toEqual([ISSUER, "2X9R4HXF34", "85012345"]);
    expect(der).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const credentials = appStoreCredentials(parsed.key);
    expect(credentials).toMatchObject({ issuer: ISSUER, keyId: "2X9R4HXF34", vendor: "85012345" });
    expect(credentials.privateKey.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
  });

  it("tidies the Issuer ID and the Key ID", () => {
    const parsed = parseAppStoreKey({
      key: PEM,
      account: ` ${ISSUER.toUpperCase()} `,
      extra: [" 2x9r4hxf34 ", " 85012345 "],
    });
    expect(parsed.key.startsWith(`${ISSUER}:2X9R4HXF34:85012345:`)).toBe(true);
  });

  it("refuses missing fields, other keys and keys that are not App Store Connect keys", () => {
    expect(() => parseAppStoreKey({ ...input(PEM), account: "not-an-issuer" })).toThrow(
      /Issuer ID/,
    );
    expect(() => parseAppStoreKey(input(PEM, []))).toThrow(/Key ID/);
    expect(() => parseAppStoreKey(input(PEM, ["2X9R4HXF34"]))).toThrow(/vendor number/);
    expect(() => parseAppStoreKey(input(PEM, ["2X9R4HXF34", "85-01"]))).toThrow(/vendor number/);
    expect(() => parseAppStoreKey(input(`rk_live_${"a".repeat(30)}`))).toThrow(
      /another payment provider/,
    );
    expect(() => parseAppStoreKey(input("2X9R4HXF34"))).toThrow(/This is a Key ID/);
    expect(() => parseAppStoreKey(input("not a key at all"))).toThrow(/\.p8 file/);
    expect(() => parseAppStoreKey(input("A".repeat(120)))).toThrow(/could not be read/);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey;
    expect(() => parseAppStoreKey(input(pem(rsa)))).toThrow(/not an App Store Connect API key/);
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" }).privateKey;
    expect(() => parseAppStoreKey(input(pem(p384)))).toThrow(/not an App Store Connect API key/);
  });
});

describe("App Store tokens", () => {
  const credentials = appStoreCredentials(parseAppStoreKey(input(PEM)).key);

  it("signs a short-lived ES256 token scoped to one request", () => {
    const now = Date.UTC(2026, 9, 27, 12);
    const scope = "GET /v1/salesReports?filter[frequency]=DAILY";
    const token = appStoreToken(credentials, scope, now);
    const [header, payload, signature] = token.split(".");
    const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    expect(decode(header)).toEqual({ alg: "ES256", kid: "2X9R4HXF34", typ: "JWT" });
    const claims = decode(payload);
    expect(claims).toEqual({
      iss: ISSUER,
      iat: now / 1000 - 60,
      exp: now / 1000 - 60 + TOKEN_LIFETIME,
      aud: "appstoreconnect-v1",
      scope: [scope],
    });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(1200);
    const signed = Buffer.from(signature, "base64url");
    expect(signed).toHaveLength(64);
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: createPublicKey(privateKey), dsaEncoding: "ieee-p1363" },
        signed,
      ),
    ).toBe(true);
  });

  it("scopes the report query with its brackets, and leaves out the page size", () => {
    const query = reportQuery("85012345", "SUBSCRIPTION", "2026-10-26");
    expect(query).toBe(
      "filter[frequency]=DAILY&filter[reportDate]=2026-10-26&filter[reportSubType]=SUMMARY&filter[reportType]=SUBSCRIPTION&filter[vendorNumber]=85012345&filter[version]=1_3",
    );
    expect(reportQuery("85012345", "SALES", "2026-10-26")).toContain("filter[version]=1_0");
    expect(scopeOf("/v1/salesReports", query)).toBe(`GET /v1/salesReports?${query}`);
    expect(scopeOf("/v1/certificates", "limit=1")).toBe("GET /v1/certificates");
  });
});

const tsv = (header: string[], rows: string[][]) =>
  [header, ...rows].map((cells) => cells.join("\t")).join("\n");

describe("App Store reports", () => {
  it("unpacks gzip and reads columns by name", () => {
    const text = `${BOM}App Apple ID\tCustomer  Price \r\n123\t9.99\r\n\r\n`;
    expect(reportText(gzipSync(text))).toBe(text);
    expect(reportText(Buffer.from(text))).toBe(text);
    expect(parseReport(text)).toEqual([{ "app apple id": "123", "customer price": "9.99" }]);
    expect(parseReport("")).toEqual([]);
  });
});

const SUBSCRIPTION_HEADER = [
  "App Apple ID",
  "Standard Subscription Duration",
  "Customer Price",
  "Customer Currency",
  "Active Standard Price Subscriptions",
  "Active Free Trial Introductory Offer Subscriptions",
  "Active Pay Up Front Introductory Offer Subscriptions",
  "Active Pay As You Go Introductory Offer Subscriptions",
  "Pay Up Front Promotional Offer Subscriptions",
  "Pay As You Go Offer Code Subscriptions",
  "Pay Up Front Win-Back Offers",
  "Marketing Opt-Ins",
  "Billing Retry",
  "Grace Period",
  "Subscribers",
];
const subscriptions = (rows: string[][]) => parseReport(tsv(SUBSCRIPTION_HEADER, rows));
// App, duration, price, currency, standard, then free trials, paid offers and other counts.
const row = (app: string, duration: string, price: string, currency: string, standard: number) => [
  app,
  duration,
  price,
  currency,
  String(standard),
  ...Array(10).fill("0"),
];

describe("App Store MRR", () => {
  it("reads every standard duration", () => {
    expect(durationMonths("7 Days")).toBeCloseTo(7 / AVERAGE_MONTH_DAYS);
    expect(durationMonths("1 Month")).toBe(1);
    expect(durationMonths("2 Months")).toBe(2);
    expect(durationMonths("3 months")).toBe(3);
    expect(durationMonths("6 Months")).toBe(6);
    expect(durationMonths("1 Year")).toBe(12);
    expect(durationMonths("")).toBeNull();
    expect(durationMonths("Lifetime")).toBeNull();
  });

  it("counts active standard subscriptions at their price over their duration", () => {
    const offers = row("100", "1 Month", "9.99", "USD", 0);
    // Free trials, then paid introductory, promotional, offer code and win-back offers.
    offers.splice(5, 6, "7", "1", "2", "3", "4", "5");
    const rows = subscriptions([
      row("100", "1 Month", "9.99", "USD", 10),
      row("100", "1 Year", "59.99", "USD", 2),
      row("100", "7 Days", "2.99", "USD", 1),
      row("200", "3 Months", "1200", "JPY", 3),
      row("200", "6 Months", "6.000", "KWD", 1),
      row("300", "1 Month", "0.00", "USD", 50),
      row("400", "1 Month", "4.99", "EUR", 0),
      row("500", "Lifetime", "4.99", "EUR", 2),
      offers,
    ]);
    const mrr = appStoreMrr("85012345", rows);
    expect(mrr.byCurrency.usd).toBeCloseTo(
      10 * 999 + (2 * 5999) / 12 + (299 * AVERAGE_MONTH_DAYS) / 7,
    );
    expect(mrr.byCurrency.jpy).toBe(1200);
    expect(mrr.byCurrency.kwd).toBe(1000);
    expect(mrr.byCurrency.eur).toBeUndefined();
    // Subscriptions, not people; free ones and trials count for nothing.
    expect(mrr.customers).toBe(17);
    // Two of unknown duration, and 15 on paid offers whose price the report does not give.
    expect(mrr.skippedItems).toBe(17);
    expect(mrr.subscriptionIds).toEqual(["vendor:85012345", "app:100", "app:200"]);
  });

  it("counts nothing in an empty report, and refuses one without the columns", () => {
    expect(appStoreMrr("85012345", [])).toEqual({
      byCurrency: {},
      customers: 0,
      skippedItems: 0,
      subscriptionIds: ["vendor:85012345"],
    });
    expect(() => appStoreMrr("1", [{ "customer price": "1" }])).toThrow(/expected columns/);
  });
});

describe("App Store history", () => {
  const now = new Date(Date.UTC(2026, 9, 2, 6));

  it("tries the last week for the latest report, newest first", () => {
    expect(recentDays(now)).toEqual([
      "2026-10-01",
      "2026-09-30",
      "2026-09-29",
      "2026-09-28",
      "2026-09-27",
      "2026-09-26",
      "2026-09-25",
    ]);
  });

  it("reads each month-end and 30 days ago once, before the latest report", () => {
    expect(historyDates(now, "2026-09-30")).toEqual([
      "2025-10-31",
      "2025-11-30",
      "2025-12-31",
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-02",
    ]);
    // A latest report from before the last month-end stands for it.
    expect(historyDates(now, "2026-09-29")).not.toContain("2026-09-30");
    // Thirty days back may be a month-end; it is read once.
    const may = new Date(Date.UTC(2026, 4, 30, 6));
    expect(historyDates(may, "2026-05-29").filter((day) => day === "2026-04-30")).toHaveLength(1);
  });

  it("gives each report's MRR on its day, and the latest's until now", () => {
    const report = (standard: number) =>
      subscriptions([row("1", "1 Month", "10", "USD", standard)]);
    const lines = snapshotLines(
      "85012345",
      [
        { date: "2026-09-30", rows: report(5) },
        { date: "2026-08-31", rows: report(3) },
        { date: "2026-09-02", rows: report(4) },
      ],
      "2026-09-30",
      now,
    );
    const at = (day: string) => dayStart(day) + DAY - 1;
    expect(mrrAt(lines, at("2026-08-31"))).toEqual({ usd: 3000 });
    expect(mrrAt(lines, at("2026-09-02"))).toEqual({ usd: 4000 });
    expect(mrrAt(lines, at("2026-09-30"))).toEqual({ usd: 5000 });
    expect(mrrAt(lines, Math.floor(now.getTime() / 1000))).toEqual({ usd: 5000 });
    expect(mrrAt(lines, at("2026-07-31"))).toEqual({});
  });
});

const SALES_HEADER = ["Product Type Identifier", "Units", "Customer Price", "Customer Currency"];
const sales = (rows: string[][]) => parseReport(tsv(SALES_HEADER, rows));

describe("App Store sales", () => {
  it("gives one payment per currency and kind, after refunds and credits", () => {
    const payments = salesPayments(
      "85012345",
      "2026-10-20",
      sales([
        ["IAY", "4", "9.99", "USD"],
        ["IAY-M", "1", "59.99", "USD"],
        ["IAY", "-1", "-9.99", "USD"],
        ["IA1", "2", "4.99", "USD"],
        ["1F", "100", "0", "USD"],
        ["7F", "40", "0.00", "USD"],
        ["1-B", "5", "2.99", "USD"],
        // Credits towards the bundle for apps bought before.
        ["1F", "-5", "-0.99", "USD"],
        // A partial refund shows no units.
        ["IA1", "0", "-1.50", "USD"],
        ["IA9", "1", "1200", "JPY"],
        ["IAY", "-2", "-8.00", "EUR"],
      ]),
    );
    const byId = Object.fromEntries(payments.map((payment) => [payment.id, payment]));
    expect(Object.keys(byId).sort()).toEqual([
      "85012345:2026-10-20:jpy:one_time",
      "85012345:2026-10-20:usd:one_time",
      "85012345:2026-10-20:usd:subscription",
    ]);
    const at = dayStart("2026-10-20");
    expect(byId["85012345:2026-10-20:usd:subscription"]).toMatchObject({
      at,
      kind: "subscription",
      fingerprint: "5:1:9995:999",
    });
    expect(byId["85012345:2026-10-20:usd:subscription"].value?.amount).toBeCloseTo(8996);
    expect(byId["85012345:2026-10-20:usd:one_time"].value?.amount).toBeCloseTo(998 + 1495 - 495);
    expect(byId["85012345:2026-10-20:jpy:one_time"]).toMatchObject({
      value: { currency: "jpy", amount: 1200 },
      kind: "one_time",
    });
  });

  it("changes the fingerprint with the units, and never goes below nothing", () => {
    const one = salesPayments("1", "2026-10-20", sales([["IA1", "1", "5", "USD"]]))[0];
    const two = salesPayments(
      "1",
      "2026-10-20",
      sales([
        ["IA1", "1", "5", "USD"],
        ["IA1", "-2", "-5", "USD"],
      ]),
    )[0];
    expect(two.id).toBe(one.id);
    expect(two.fingerprint).not.toBe(one.fingerprint);
    expect(two.value).toEqual({ currency: "usd", amount: 0 });
  });

  it("reads each day of a window back to the first day Apple keeps", () => {
    const now = new Date(Date.UTC(2026, 9, 27, 9));
    expect(firstReportDay(now)).toBe("2025-10-28");
    expect(reportDays(dayStart("2026-10-20"), dayStart("2026-10-23"), now)).toEqual([
      "2026-10-22",
      "2026-10-21",
      "2026-10-20",
    ]);
    // Up to yesterday, and not before Apple's first day.
    expect(reportDays(dayStart("2026-10-25"), null, now)).toEqual(["2026-10-26", "2026-10-25"]);
    expect(reportDays(0, null, now)).toHaveLength(364);
    expect(reportDays(0, dayStart("2025-10-28"), now)).toEqual([]);
  });
});

// The adapter end to end against the fake server the browser tests use.
describe("App Store adapter", () => {
  const base = "http://127.0.0.1:3011/appstore";
  const stored = (name: keyof typeof APPSTORE, vendor?: string) => {
    const key = APPSTORE[name];
    return parseAppStoreKey({
      key: key.privateKey.replace(/\n/g, ""),
      account: key.issuer,
      extra: [key.keyId, vendor ?? key.vendor],
    }).key;
  };
  const requests: { url: URL; method: string }[] = [];
  let limitAfter = Infinity;

  beforeEach(() => {
    requests.length = 0;
    limitAfter = Infinity;
    vi.stubEnv("APPSTORE_API_BASE", base);
    vi.stubGlobal("fetch", async (address: URL | string, init?: RequestInit) => {
      const url = new URL(String(address));
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url.origin !== "http://127.0.0.1:3011") throw new TypeError("fetch failed");
      if (url.pathname.endsWith("/salesReports") && --limitAfter < 0)
        return new Response(JSON.stringify({ errors: [{ status: "429" }] }), { status: 429 });
      const headers = Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([name, value]) => [
          name.toLowerCase(),
          value,
        ]),
      );
      let status = 500;
      let type = "application/json";
      let body: Buffer | string = "";
      await handleAppStore(
        url,
        { method, headers },
        {
          writeHead: (code: number, head: Record<string, string>) => {
            status = code;
            type = head["content-type"];
          },
          end: (content: Buffer | string) => {
            body = content;
          },
        },
      );
      return new Response(body, { status, headers: { "content-type": type } });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const rates = new Map([["eur", 0.8]]);
  const today = () => dayOf(Date.now() / 1000);
  const ageOf = (day: string) => Math.round((dayStart(today()) - dayStart(day)) / DAY);

  it("verifies MRR and the history from the subscription reports", async () => {
    const now = new Date();
    const reading = await appstore.read(stored("one"), true, {
      allowTest: false,
      now,
      history: true,
    });
    expect(reading).toMatchObject({
      livemode: true,
      customers: 18,
      skippedItems: 3,
      historyNote: null,
      subscriptionIds: ["vendor:85000001", "app:6400000001"],
    });
    expect(reading.byCurrency).toEqual({ usd: 13000, eur: 4000 });
    expect(toUsdCents(reading.byCurrency, rates)).toBe(18000);
    const lines = reading.lines!;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    expect(toUsdCents(mrrAt(lines, nowSeconds), rates)).toBe(18000);
    expect(toUsdCents(mrrAt(lines, nowSeconds - 30 * DAY), rates)).toBe(13000);
    expect(monthEnds(now).map(({ at }) => toUsdCents(mrrAt(lines, at), rates))).toEqual(
      monthEnds(now).map(({ at }) => {
        const age = ageOf(dayOf(at));
        return age <= 20 ? 18000 : age <= 150 ? 13000 : 10000;
      }),
    );
    // Only GET requests, each with a token scoped to it, which the fake checks.
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requests.length).toBeLessThanOrEqual(3 + 1 + 13);
  });

  it("reads the same MRR without the history, from yesterday's report", async () => {
    const now = new Date();
    const light = await appstore.read(stored("one"), true, {
      allowTest: false,
      now,
      history: false,
    });
    expect(light).toMatchObject({ lines: null, historyNote: null, customers: 18 });
    expect(toUsdCents(light.byCurrency, rates)).toBe(18000);
    const reports = requests.filter(({ url }) => url.pathname.endsWith("/salesReports"));
    expect(reports).toHaveLength(1);
    expect(reports[0].url.searchParams.get("filter[reportDate]")).toBe(addDays(today(), -1));
  });

  it("refuses a key that can do more than download reports", async () => {
    const options = { allowTest: false, now: new Date(), history: false };
    await expect(appstore.read(stored("wide"), true, options)).rejects.toThrow(
      /more than download reports/,
    );
    await expect(
      appstore.payments(stored("wide"), true, {
        allowTest: false,
        since: 0,
        before: null,
        maxPages: 5,
        stored: () => null,
      }),
    ).rejects.toThrow(/more than download reports/);
  });

  it("verifies a team without subscriptions at nothing, and refuses a wrong vendor number", async () => {
    const options = { allowTest: false, now: new Date(), history: true };
    const none = await appstore.read(stored("none"), true, options);
    expect(none).toMatchObject({
      byCurrency: {},
      customers: 0,
      subscriptionIds: ["vendor:85000003"],
      lines: [],
    });
    await expect(appstore.read(stored("one", "85000009"), true, options)).rejects.toThrow(
      /vendor number/,
    );
  });

  it("refuses a key Apple does not know", async () => {
    const key = parseAppStoreKey(input(PEM)).key;
    await expect(
      appstore.read(key, true, { allowTest: false, now: new Date(), history: false }),
    ).rejects.toThrow(/Apple refused the key/);
  });

  it("is refused a token scoped to another request", async () => {
    const credentials = appStoreCredentials(stored("one"));
    const query = reportQuery(credentials.vendor, "SALES", addDays(today(), -3));
    const call = async (scope: string) => {
      let status = 0;
      await handleAppStore(
        new URL(`${base}/v1/salesReports?${query}`),
        {
          method: "GET",
          headers: { authorization: `Bearer ${appStoreToken(credentials, scope)}` },
        },
        { writeHead: (code: number) => (status = code), end: () => {} },
      );
      return status;
    };
    expect(await call(scopeOf("/v1/salesReports", query))).toBe(200);
    expect(await call(scopeOf("/v1/salesReports", query.replace("SALES", "SUBSCRIPTION")))).toBe(
      401,
    );
    expect(await call("GET /v1/apps")).toBe(401);
  });

  const read = (since: number, before: number | null, maxPages: number) =>
    appstore.payments(stored("one"), true, {
      allowTest: false,
      since,
      before,
      maxPages,
      stored: () => null,
    });
  const value = (payments: ListedPayment[], kind?: string) =>
    toUsdCents(
      payments
        .filter((payment) => !kind || payment.kind === kind)
        .reduce<Record<string, number>>((totals, payment) => {
          const { currency, amount } = payment.value!;
          totals[currency] = (totals[currency] ?? 0) + amount;
          return totals;
        }, {}),
      rates,
    );

  it("reads the payments of the last six months, a day a request", async () => {
    const since = dayStart(rereadFrom(new Date()));
    const recent = await read(since, null, 200);
    expect(recent.complete).toBe(true);
    expect(recent.payments).toHaveLength(6);
    expect(value(recent.payments)).toBe(4000 + 998 + 5000 + 998 + 2990);
    expect(
      value(recent.payments.filter((payment) => payment.at >= dayStart(today()) - 30 * DAY)),
    ).toBe(10996);
    const ids = recent.payments.map((payment) => payment.id);
    expect(ids).toContain(`85000001:${addDays(today(), -10)}:eur:subscription`);
    expect(requests.filter(({ url }) => url.pathname.endsWith("/salesReports"))).toHaveLength(183);
  });

  it("goes on from where a read stopped, back to the first day Apple keeps", async () => {
    const before = dayStart(rereadFrom(new Date()));
    const first = await read(0, before, 100);
    expect(first.complete).toBe(false);
    expect(first.from).toBe(dayStart(addDays(today(), -283)));
    expect(first.payments.map((payment) => payment.kind)).toEqual(["subscription"]);
    expect(value(first.payments)).toBe(12000);
    expect(coveredFrom(first, "1970-01-01", rereadFrom(new Date()))).toBe(addDays(today(), -283));
    const rest = await read(0, first.from!, 100);
    expect(rest).toEqual({ payments: [], complete: true });
  });

  it("keeps what it read when Apple starts limiting requests", async () => {
    limitAfter = 5;
    const partial = await read(0, null, 200);
    expect(partial).toMatchObject({ complete: false, from: dayStart(addDays(today(), -5)) });
    expect(value(partial.payments)).toBe(4000 + 998);
  });
});
