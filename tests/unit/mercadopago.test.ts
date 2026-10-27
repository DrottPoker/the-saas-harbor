import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleMercadoPago, MERCADOPAGO } from "../e2e/fake-mercadopago.mjs";
import { mrrAt } from "../../src/lib/revenue/history";
import { AVERAGE_MONTH_DAYS } from "../../src/lib/revenue/money";
import { fetchPayments, MAX_OFFSET } from "../../src/lib/revenue/mercadopago/client";
import { mercadopago, renewalDue, RENEW_BEFORE } from "../../src/lib/revenue/mercadopago/index";
import {
  decodeMercadoPagoKey,
  encodeMercadoPagoKey,
  mercadoPagoHint,
  parseMercadoPagoKey,
  type MercadoPagoKey,
} from "../../src/lib/revenue/mercadopago/key";
import {
  chargedAmount,
  frequencyMonths,
  isSale,
  isSubscriptionPayment,
  mercadoPagoMrr,
  mercadoPagoServiceLines,
  preapprovalOf,
  searchStart,
  trialEnd,
  type MercadoPagoPayment,
  type MercadoPagoPreapproval,
} from "../../src/lib/revenue/mercadopago/mrr";
import {
  exchangeMercadoPagoCode,
  mercadoPagoAuthorizeUrl,
  readOnlyScopes,
} from "../../src/lib/revenue/mercadopago/oauth";
import { mercadoPagoPayments } from "../../src/lib/revenue/mercadopago/payments";

// The adapter pages through searches, so requests are not spaced out here as in production.
vi.mock("../../src/lib/revenue/http", async (importOriginal) => {
  const http = await importOriginal<typeof import("../../src/lib/revenue/http")>();
  return {
    ...http,
    providerGet: (_provider: string, _name: string, url: URL, headers: Record<string, string>) =>
      fetch(url, { headers, cache: "no-store" }),
  };
});

const DAY = 86_400;
const USER = "7700112233";
const at = (year: number, month: number, day = 1) => Date.UTC(year, month, day) / 1000;
const NOW = at(2026, 9, 27) + 12 * 3_600;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace(/Z$/, "-04:00");

const TOKEN = `APP_USR-4934588586838432-102709-0f1e2d3c4b5a-${USER}`;
const REFRESH = `TG-0f1e2d3c4b5a6978-${USER}`;
const stored: MercadoPagoKey = {
  accessToken: TOKEN,
  refreshToken: REFRESH,
  expiresAt: NOW + 150 * DAY,
  userId: USER,
};

function preapproval(overrides: Partial<MercadoPagoPreapproval> = {}): MercadoPagoPreapproval {
  return {
    id: "pre_1",
    status: "authorized",
    payer_id: 9001,
    collector_id: Number(USER),
    date_created: iso(at(2026, 0, 10)),
    ...overrides,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 50,
      currency_id: "BRL",
      start_date: iso(at(2026, 0, 10)),
      end_date: null,
      free_trial: null,
      ...overrides.auto_recurring,
    },
  };
}

function payment(overrides: Partial<MercadoPagoPayment> = {}): MercadoPagoPayment {
  return {
    id: 1001,
    status: "approved",
    date_approved: iso(at(2026, 8, 10)),
    operation_type: "regular_payment",
    currency_id: "BRL",
    transaction_amount: 100,
    transaction_amount_refunded: 0,
    taxes_amount: 0,
    coupon_amount: 0,
    live_mode: true,
    collector_id: Number(USER),
    ...overrides,
  };
}

const charge = (id: number, subscription: string, approved: number, amount: number | string) =>
  payment({
    id,
    date_approved: iso(approved),
    transaction_amount: amount,
    operation_type: "recurring_payment",
    point_of_interaction: {
      type: "SUBSCRIPTIONS",
      transaction_data: { subscription_id: subscription },
    },
  });

describe("Mercado Pago stored keys", () => {
  it("keep both tokens, the expiry and the account in one documented string", () => {
    const encoded = encodeMercadoPagoKey(stored);
    expect(encoded).toBe(`1:${NOW + 150 * DAY}:${USER}:${TOKEN}:${REFRESH}`);
    expect(decodeMercadoPagoKey(encoded)).toEqual(stored);
    expect(mercadoPagoHint(USER)).toBe("…2233");
  });

  it("refuse anything else, and every pasted value", () => {
    expect(() => decodeMercadoPagoKey(TOKEN)).toThrow(/Connect Mercado Pago again/);
    expect(() => decodeMercadoPagoKey(`2:1:${USER}:${TOKEN}:${REFRESH}`)).toThrow(/again/);
    expect(() => decodeMercadoPagoKey(`1:1:${USER}:${TOKEN}:${REFRESH}:extra`)).toThrow(/again/);
    expect(() => encodeMercadoPagoKey({ ...stored, refreshToken: "" })).toThrow(/did not complete/);
    expect(() => encodeMercadoPagoKey({ ...stored, userId: "seller" })).toThrow(/did not complete/);
    expect(() => parseMercadoPagoKey()).toThrow(/Connect with Mercado Pago button/);
  });

  it("are renewed once fewer than 30 days of the access token remain", () => {
    expect(RENEW_BEFORE).toBe(30 * DAY);
    expect(renewalDue({ ...stored, expiresAt: NOW + 31 * DAY }, NOW)).toBe(false);
    expect(renewalDue({ ...stored, expiresAt: NOW + 30 * DAY }, NOW)).toBe(true);
    expect(renewalDue({ ...stored, expiresAt: NOW - DAY }, NOW)).toBe(true);
  });
});

describe("Mercado Pago OAuth", () => {
  it("asks for approval with the state and an S256 challenge", () => {
    const saved = process.env.MERCADOPAGO_OAUTH_BASE;
    delete process.env.MERCADOPAGO_OAUTH_BASE;
    const verifier = "v".repeat(64);
    const url = new URL(
      mercadoPagoAuthorizeUrl("123456", {
        state: "state-1",
        verifier,
        redirectUri: "https://thesaasharbor.com/api/mercadopago/callback",
      }),
    );
    if (saved !== undefined) process.env.MERCADOPAGO_OAUTH_BASE = saved;
    expect(url.origin + url.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "123456",
      response_type: "code",
      platform_id: "mp",
      state: "state-1",
      redirect_uri: "https://thesaasharbor.com/api/mercadopago/callback",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
  });

  it("accepts reading and renewal only", () => {
    expect(readOnlyScopes(["offline_access", "read"])).toBe(true);
    expect(readOnlyScopes(["offline_access", "read", "write"])).toBe(false);
    expect(readOnlyScopes(["read"])).toBe(false);
    expect(readOnlyScopes(["offline_access"])).toBe(false);
    expect(readOnlyScopes([])).toBe(false);
  });
});

describe("Mercado Pago frequencies", () => {
  it("read months and days", () => {
    expect(frequencyMonths({ frequency: 1, frequency_type: "months" })).toBe(1);
    expect(frequencyMonths({ frequency: "12", frequency_type: "months" })).toBe(12);
    expect(frequencyMonths({ frequency: 7, frequency_type: "days" })).toBeCloseTo(
      7 / AVERAGE_MONTH_DAYS,
      10,
    );
    expect(frequencyMonths({ frequency: 1, frequency_type: "weeks" })).toBeNull();
    expect(frequencyMonths({ frequency: 0, frequency_type: "months" })).toBeNull();
    expect(frequencyMonths({ frequency: null, frequency_type: null })).toBeNull();
    expect(frequencyMonths("1 month")).toBeNull();
  });

  it("end a free trial one trial period after the start", () => {
    const trial = preapproval({
      auto_recurring: { free_trial: { frequency: 14, frequency_type: "days" } },
    });
    expect(trialEnd(trial)).toBe(at(2026, 0, 24) + 4 * 3_600);
    expect(trialEnd(preapproval())).toBeNull();
    expect(
      trialEnd(
        preapproval({ auto_recurring: { free_trial: { frequency: null, frequency_type: null } } }),
      ),
    ).toBeNull();
  });
});

describe("Mercado Pago MRR", () => {
  it("normalizes authorized subscriptions to a month, in each currency's minor units", () => {
    const result = mercadoPagoMrr(
      [
        preapproval(),
        preapproval({ id: "pre_2", auto_recurring: { transaction_amount: "25.50" } }),
        preapproval({
          id: "pre_3",
          payer_id: 9002,
          auto_recurring: { frequency: 12, transaction_amount: 600 },
        }),
        preapproval({
          id: "pre_4",
          payer_id: 9003,
          auto_recurring: { frequency: 3, transaction_amount: 30000, currency_id: "CLP" },
        }),
        preapproval({
          id: "pre_5",
          payer_id: 9004,
          auto_recurring: { frequency: 7, frequency_type: "days", transaction_amount: 7 },
        }),
      ],
      NOW,
      USER,
    );
    expect(result.byCurrency.brl).toBeCloseTo(
      5000 + 2550 + 5000 + 700 * (AVERAGE_MONTH_DAYS / 7),
      6,
    );
    expect(result.byCurrency.clp).toBe(10_000);
    expect(result).toMatchObject({
      customers: 4,
      subscriptionIds: ["pre_1", "pre_2", "pre_3", "pre_4", "pre_5"],
      skippedItems: 0,
    });
  });

  it("leaves out other statuses, trials, ended and future subscriptions, and other sellers'", () => {
    const result = mercadoPagoMrr(
      [
        preapproval({ id: "paused", status: "paused" }),
        preapproval({ id: "pending", status: "pending" }),
        preapproval({ id: "cancelled", status: "cancelled" }),
        preapproval({
          id: "trial",
          auto_recurring: {
            start_date: iso(NOW - 5 * DAY),
            free_trial: { frequency: 1, frequency_type: "months" },
          },
        }),
        preapproval({ id: "ended", auto_recurring: { end_date: iso(NOW - DAY) } }),
        preapproval({ id: "future", auto_recurring: { start_date: iso(NOW + DAY) } }),
        preapproval({ id: "other", collector_id: 1234 }),
      ],
      NOW,
      USER,
    );
    expect(result).toEqual({ byCurrency: {}, customers: 0, subscriptionIds: [], skippedItems: 0 });
    // A trial that has ended counts.
    const past = preapproval({
      auto_recurring: {
        start_date: iso(NOW - 40 * DAY),
        free_trial: { frequency: 1, frequency_type: "months" },
      },
    });
    expect(mercadoPagoMrr([past], NOW, USER).byCurrency).toEqual({ brl: 5000 });
  });

  it("skips subscriptions it cannot value, and counts free ones without a customer", () => {
    const result = mercadoPagoMrr(
      [
        preapproval({ id: "no_amount", auto_recurring: { transaction_amount: null } }),
        preapproval({ id: "no_currency", auto_recurring: { currency_id: null } }),
        preapproval({ id: "weekly", auto_recurring: { frequency_type: "weeks" } }),
        preapproval({ id: "free", auto_recurring: { transaction_amount: 0 } }),
      ],
      NOW,
      USER,
    );
    expect(result).toEqual({
      byCurrency: {},
      customers: 0,
      subscriptionIds: ["free"],
      skippedItems: 3,
    });
  });
});

describe("Mercado Pago payments", () => {
  it("name their subscription in the point of interaction, the metadata or the payment", () => {
    expect(preapprovalOf(charge(1, "pre_a", NOW, 50))).toBe("pre_a");
    expect(preapprovalOf(payment({ metadata: { preapproval_id: "pre_b" } }))).toBe("pre_b");
    expect(preapprovalOf(payment({ preapproval_id: "pre_c" }))).toBe("pre_c");
    expect(preapprovalOf(payment({ metadata: { preapproval_id: 7 } }))).toBeNull();
    expect(isSubscriptionPayment(payment({ operation_type: "recurring_payment" }))).toBe(true);
    expect(isSubscriptionPayment(payment({ operation_type: "subscription_payment" }))).toBe(true);
    expect(isSubscriptionPayment(payment())).toBe(false);
  });

  it("are valued after the coupon and without tax", () => {
    expect(chargedAmount(payment({ transaction_amount: "100.00", taxes_amount: 10 }))).toEqual({
      currency: "brl",
      gross: 10_000,
      paid: 10_000,
      untaxed: 9_000,
    });
    expect(chargedAmount(payment({ transaction_amount: 60, coupon_amount: 10 }))).toMatchObject({
      paid: 5_000,
      untaxed: 5_000,
    });
    expect(chargedAmount(payment({ currency_id: "CLP", transaction_amount: 15000 }))).toMatchObject(
      {
        currency: "clp",
        untaxed: 15_000,
      },
    );
    expect(chargedAmount(payment({ transaction_amount: 0 }))).toBeNull();
    expect(chargedAmount(payment({ currency_id: null }))).toBeNull();
  });

  it("count approved sales to the seller in the account's mode", () => {
    expect(isSale(payment(), true, USER)).toBe(true);
    expect(isSale(payment({ operation_type: null }), true, USER)).toBe(true);
    expect(isSale(payment({ operation_type: "pos_payment" }), true, USER)).toBe(true);
    expect(isSale(payment({ status: "refunded" }), true, USER)).toBe(false);
    expect(isSale(payment({ date_approved: null }), true, USER)).toBe(false);
    expect(isSale(payment({ operation_type: "money_transfer" }), true, USER)).toBe(false);
    expect(isSale(payment({ operation_type: "account_fund" }), true, USER)).toBe(false);
    expect(isSale(payment({ collector_id: 1 }), true, USER)).toBe(false);
    expect(isSale(payment({ live_mode: false }), true, USER)).toBe(false);
    expect(isSale(payment({ live_mode: false }), false, USER)).toBe(true);
  });

  it("are listed back to the start of the day after 365 days ago", () => {
    expect(searchStart(NOW)).toBe(at(2025, 9, 28));
    // 2028 is a leap year, so the same date a year back is 366 days ago.
    expect(searchStart(at(2028, 2, 15) + 3_600)).toBe(at(2027, 2, 17));
  });
});

describe("Mercado Pago history", () => {
  const preapprovals = new Map([
    ["pre_m", preapproval({ id: "pre_m" })],
    [
      "pre_y",
      preapproval({ id: "pre_y", auto_recurring: { frequency: 12, transaction_amount: 1200 } }),
    ],
    [
      "pre_d",
      preapproval({ id: "pre_d", auto_recurring: { frequency: 7, frequency_type: "days" } }),
    ],
  ]);

  it("counts each subscription charge without tax over one frequency of its subscription", () => {
    const taxed = { ...charge(2, "pre_m", at(2026, 1, 1), 50), taxes_amount: 5 };
    const lines = mercadoPagoServiceLines(
      [
        { ...charge(1, "pre_m", at(2026, 0, 31), 50), date_approved: "2026-01-31T00:00:00.000Z" },
        { ...taxed, id: 2, date_approved: "2026-03-01T00:00:00.000Z" },
        { ...charge(3, "pre_y", at(2026, 0, 15), 1200), date_approved: "2026-01-15T00:00:00.000Z" },
        { ...charge(4, "pre_d", at(2026, 0, 1), 14), date_approved: "2026-01-01T00:00:00.000Z" },
        payment({ id: 5 }),
        { ...charge(6, "pre_m", at(2026, 0, 1), 50), status: "rejected" },
      ],
      preapprovals,
      true,
      USER,
    );
    expect(lines).toEqual([
      // The last day of February, since February has no 31st.
      { start: at(2026, 0, 31), end: at(2026, 1, 28), currency: "brl", monthly: 5000 },
      { start: at(2026, 2, 1), end: at(2026, 3, 1), currency: "brl", monthly: 4500 },
      { start: at(2026, 0, 15), end: at(2027, 0, 15), currency: "brl", monthly: 10_000 },
      {
        start: at(2026, 0, 1),
        end: at(2026, 0, 8),
        currency: "brl",
        monthly: 1400 / (7 / AVERAGE_MONTH_DAYS),
      },
    ]);
    expect(mrrAt(lines!, at(2026, 0, 31) + DAY).brl).toBe(15_000);
  });

  it("is null when charges of subscriptions name none that were read", () => {
    const unnamed = payment({ id: 7, operation_type: "recurring_payment" });
    expect(mercadoPagoServiceLines([unnamed], preapprovals, true, USER)).toBeNull();
    expect(
      mercadoPagoServiceLines([charge(8, "pre_gone", NOW, 50)], preapprovals, true, USER),
    ).toBeNull();
    // Among charges that do have lines, one without is left out.
    expect(
      mercadoPagoServiceLines([unnamed, charge(9, "pre_m", NOW, 50)], preapprovals, true, USER),
    ).toHaveLength(1);
    expect(mercadoPagoServiceLines([payment()], preapprovals, true, USER)).toEqual([]);
  });
});

describe("Mercado Pago revenue", () => {
  it("counts approved sales without tax, less refunds at the same share", () => {
    const listed = mercadoPagoPayments(
      [
        payment({ id: 1, transaction_amount: 100, taxes_amount: 10 }),
        payment({ id: 2, transaction_amount: 80, transaction_amount_refunded: 30 }),
        payment({
          id: 3,
          transaction_amount: 100,
          taxes_amount: 20,
          transaction_amount_refunded: 50,
        }),
        payment({ id: 4, transaction_amount: 60, coupon_amount: 10 }),
        payment({ id: 5, transaction_amount: 40, transaction_amount_refunded: 40 }),
        charge(6, "pre_m", at(2026, 8, 1), "50.00"),
        payment({ id: 7, operation_type: "recurring_payment" }),
        payment({ id: 8, operation_type: "money_transfer" }),
        payment({ id: 9, status: "rejected" }),
        payment({ id: 1, transaction_amount: 100, taxes_amount: 10 }),
      ],
      true,
      USER,
    );
    const byId = Object.fromEntries(listed.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(byId["1"]).toEqual({
      id: "1",
      at: at(2026, 8, 10) + 4 * 3_600,
      fingerprint: "10000:0",
      value: { currency: "brl", amount: 9_000 },
      kind: "one_time",
    });
    expect(byId["2"]).toMatchObject({ fingerprint: "8000:3000", value: { amount: 5_000 } });
    expect(byId["3"].value!.amount).toBeCloseTo(8_000 - 5_000 * 0.8, 6);
    expect(byId["4"].value!.amount).toBe(5_000);
    expect(byId["5"].value!.amount).toBe(0);
    expect(byId["6"]).toMatchObject({ kind: "subscription", value: { amount: 5_000 } });
    expect(byId["7"].kind).toBe("subscription");
  });

  it("leaves out test payments from a live account only", () => {
    const test = payment({ id: 1, live_mode: false });
    expect(mercadoPagoPayments([test], true, USER)).toEqual([]);
    expect(mercadoPagoPayments([test], false, USER)).toHaveLength(1);
  });
});

describe("Mercado Pago payment search", () => {
  const MS = 1000;
  // Newest first, three a second, so one instant never holds more than a page.
  const all = Array.from({ length: 10_120 }, (_, k) =>
    payment({
      id: 50_000 + k,
      date_approved: new Date((NOW - Math.floor(k / 3)) * MS).toISOString(),
    }),
  );

  function stub() {
    const requests: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        const url = new URL(input);
        requests.push(url);
        const query = url.searchParams;
        const offset = Number(query.get("offset"));
        const limit = Number(query.get("limit"));
        if (offset > MAX_OFFSET || limit > 50)
          return Response.json({ message: "Number of rows exceeded the limits." }, { status: 400 });
        const from = Date.parse(query.get("begin_date")!);
        const to = Date.parse(query.get("end_date")!);
        const listed = all.filter((p) => {
          const approved = Date.parse(p.date_approved!);
          return approved >= from && approved <= to;
        });
        return Response.json({
          paging: { total: listed.length, limit, offset },
          results: listed.slice(offset, offset + limit),
        });
      }),
    );
    return requests;
  }

  it("goes on from the oldest approval once a search reaches its largest offset", async () => {
    const requests = stub();
    try {
      const read = await fetchPayments(TOKEN, USER, {
        since: NOW - 30 * DAY,
        before: NOW + 1,
        maxPages: 400,
      });
      expect(read.complete).toBe(true);
      expect(new Set(read.payments.map((p) => p.id)).size).toBe(all.length);
      const first = requests[0].searchParams;
      expect(Object.fromEntries(first)).toMatchObject({
        sort: "date_approved",
        criteria: "desc",
        range: "date_approved",
        status: "approved",
        "collector.id": USER,
        limit: "50",
        offset: "0",
      });
      expect(first.get("end_date")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.999-00:00$/);
      expect(Math.max(...requests.map((url) => Number(url.searchParams.get("offset"))))).toBe(
        MAX_OFFSET - 50,
      );
      // The second search ends at the oldest approval the first listed.
      const restart = requests.find((url, k) => k > 0 && url.searchParams.get("offset") === "0")!;
      expect(Date.parse(restart.searchParams.get("end_date")!)).toBe(
        Date.parse(all[9_999].date_approved!),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops at the page limit, covering the window after the oldest approval listed", async () => {
    stub();
    try {
      const read = await fetchPayments(TOKEN, USER, {
        since: NOW - 30 * DAY,
        before: NOW + 1,
        maxPages: 3,
      });
      expect(read.payments).toHaveLength(150);
      expect(read).toMatchObject({ complete: false, from: NOW - 49 + 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("searches 180 days at a time, newest first", async () => {
    const requests = stub();
    try {
      const read = await fetchPayments(TOKEN, USER, {
        since: NOW - 364 * DAY,
        before: NOW - 40_000,
        maxPages: 10,
      });
      expect(read).toEqual({ payments: [], complete: true });
      expect(
        requests.map((url) => [
          url.searchParams.get("begin_date"),
          url.searchParams.get("end_date"),
        ]),
      ).toEqual([
        [
          new Date((NOW - 40_000 - 180 * DAY) * 1000).toISOString().replace("Z", "-00:00"),
          new Date((NOW - 40_000) * 1000 - 1).toISOString().replace("Z", "-00:00"),
        ],
        [
          new Date((NOW - 40_000 - 360 * DAY) * 1000).toISOString().replace("Z", "-00:00"),
          new Date((NOW - 40_000 - 180 * DAY) * 1000 - 1).toISOString().replace("Z", "-00:00"),
        ],
        [
          new Date((NOW - 364 * DAY) * 1000).toISOString().replace("Z", "-00:00"),
          new Date((NOW - 40_000 - 360 * DAY) * 1000 - 1).toISOString().replace("Z", "-00:00"),
        ],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Mercado Pago against the fake server", () => {
  let server: Server;
  let base = "";
  const saved: Record<string, string | undefined> = {};
  const ENV = [
    "MERCADOPAGO_API_BASE",
    "MERCADOPAGO_OAUTH_BASE",
    "MERCADOPAGO_CLIENT_ID",
    "MERCADOPAGO_CLIENT_SECRET",
  ];
  const client = { id: MERCADOPAGO.clientId, secret: "harbor-test-secret" };
  const redirectUri = "http://127.0.0.1/api/mercadopago/callback";
  const now = () => new Date();

  beforeAll(async () => {
    server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (!(await handleMercadoPago(url, request, response))) {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mercadopago`;
    for (const name of ENV) saved[name] = process.env[name];
    process.env.MERCADOPAGO_API_BASE = base;
    process.env.MERCADOPAGO_OAUTH_BASE = base;
    process.env.MERCADOPAGO_CLIENT_ID = client.id;
    process.env.MERCADOPAGO_CLIENT_SECRET = client.secret;
  });

  afterAll(async () => {
    for (const name of ENV)
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    await new Promise((resolve) => server.close(resolve));
  });

  /** Approves access on the fake page and exchanges the code, as the callback does. */
  async function connect(grant?: string) {
    const verifier = "harbor-verifier-".repeat(4);
    const address = new URL(
      mercadoPagoAuthorizeUrl(client.id, { state: "state-1", verifier, redirectUri }),
    );
    if (grant) address.searchParams.set("fake_grant", grant);
    const approval = await fetch(address, { redirect: "manual" });
    const back = new URL(approval.headers.get("location")!);
    expect(back.searchParams.get("state")).toBe("state-1");
    return exchangeMercadoPagoCode(
      client,
      { code: back.searchParams.get("code")!, verifier, redirectUri },
      { allowTest: false },
    );
  }

  it("connects with read-only access and reads MRR, history and revenue", async () => {
    const parsed = await connect();
    expect(parsed).toMatchObject({ hint: "…2233", livemode: true });
    const key = decodeMercadoPagoKey(parsed.key);
    expect(key.userId).toBe(String(MERCADOPAGO.user));
    expect(key.expiresAt - Date.now() / 1000).toBeGreaterThan(179 * DAY);

    const reading = await mercadopago.read(parsed.key, true, {
      allowTest: false,
      now: now(),
      history: true,
    });
    expect(reading.byCurrency).toEqual({ brl: 12_500, clp: 10_000 });
    expect(reading).toMatchObject({
      livemode: true,
      customers: 3,
      skippedItems: 1,
      historyNote: null,
    });
    expect(reading.subscriptionIds.sort()).toEqual([
      "pre_addon",
      "pre_monthly",
      "pre_quarterly",
      "pre_yearly",
    ]);
    expect(reading.renewedKey).toBeUndefined();
    // The ended subscription counts in the history, looked up by its id: at the end of the month
    // four months back, it and the BRL 50 plan were paid up.
    const today = new Date();
    const monthEnd = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, 1) / 1000 - 1;
    expect(mrrAt(reading.lines!, monthEnd).brl).toBeGreaterThanOrEqual(5_000 + 4_000);

    const hourly = await mercadopago.read(parsed.key, true, {
      allowTest: false,
      now: now(),
      history: false,
    });
    expect(hourly).toMatchObject({
      byCurrency: reading.byCurrency,
      lines: null,
      historyNote: null,
    });

    const revenue = await mercadopago.payments(parsed.key, true, {
      allowTest: false,
      since: 0,
      before: null,
      maxPages: 100,
      stored: () => null,
    });
    expect(revenue.complete).toBe(true);
    const totals: Record<string, Record<string, number>> = {};
    for (const listed of revenue.payments) {
      const kind = (totals[listed.kind!] ??= {});
      kind[listed.value!.currency] = (kind[listed.value!.currency] ?? 0) + listed.value!.amount;
    }
    expect(totals).toEqual({
      subscription: { brl: 135_500, clp: 60_000 },
      one_time: { brl: 19_000 },
    });
  });

  it("refuses access that can change the account", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(connect("wide")).rejects.toThrow(/other access than reading/);
    expect(warn).toHaveBeenCalledWith(
      "Mercado Pago issued access with these scopes:",
      "offline_access read write",
    );
    warn.mockRestore();
  });

  it("renews an access token close to its expiry, and the old tokens stop working", async () => {
    const parsed = await connect("expiring");
    const reading = await mercadopago.read(parsed.key, true, {
      allowTest: false,
      now: now(),
      history: false,
    });
    expect(reading.renewedKey).toBeDefined();
    const renewed = decodeMercadoPagoKey(reading.renewedKey!);
    expect(renewed.expiresAt - Date.now() / 1000).toBeGreaterThan(179 * DAY);
    expect(renewed.refreshToken).not.toBe(decodeMercadoPagoKey(parsed.key).refreshToken);
    // Payments use the renewed access token as stored; the old one no longer works.
    const options = { allowTest: false, since: 0, before: null, maxPages: 100, stored: () => null };
    expect((await mercadopago.payments(reading.renewedKey!, true, options)).complete).toBe(true);
    await expect(mercadopago.payments(parsed.key, true, options)).rejects.toThrow(
      /no longer accepts the connection/,
    );
  });

  it("keeps using a working access token when its renewal is refused", async () => {
    const parsed = await connect("expiring");
    const held = decodeMercadoPagoKey(parsed.key);
    const spent = encodeMercadoPagoKey({ ...held, refreshToken: `TG-spent0000-${held.userId}` });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reading = await mercadopago.read(spent, true, {
      allowTest: false,
      now: now(),
      history: false,
    });
    expect(reading.renewedKey).toBeUndefined();
    expect(reading.byCurrency).toEqual({ brl: 12_500, clp: 10_000 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    // Once the access token has expired, the founder has to connect again.
    const expired = encodeMercadoPagoKey({
      ...held,
      refreshToken: "TG-spent0001-7700112233",
      expiresAt: 1_000,
    });
    await expect(
      mercadopago.read(expired, true, { allowTest: false, now: now(), history: false }),
    ).rejects.toThrow(/Connect Mercado Pago again/);
  });

  it("refuses test accounts unless test keys are allowed", async () => {
    const parsed = await connect();
    const options = { allowTest: false, now: now(), history: false };
    await expect(mercadopago.read(parsed.key, false, options)).rejects.toThrow(/test account/);
    const read = await mercadopago.read(parsed.key, false, { ...options, allowTest: true });
    expect(read.livemode).toBe(false);
  });
});
