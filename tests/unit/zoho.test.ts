import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleZoho, ZOHO } from "../e2e/fake-zoho.mjs";
import { newOAuthFlow, pkceChallenge } from "../../src/lib/revenue/oauth";
import { zoho } from "../../src/lib/revenue/zoho";
import { readOnlyScopes, scopeList, ZOHO_SCOPES } from "../../src/lib/revenue/zoho/client";
import {
  callbackDataCentre,
  parseZohoKey,
  readZohoKey,
  zohoHint,
  zohoStoredKey,
} from "../../src/lib/revenue/zoho/key";
import { billingMonths, zohoMrr, type ZohoSubscription } from "../../src/lib/revenue/zoho/mrr";
import { exchangeZohoCode, zohoAuthorizeUrl } from "../../src/lib/revenue/zoho/oauth";
import { inWindow, zohoPayments, type ZohoPayment } from "../../src/lib/revenue/zoho/payments";
import { AVERAGE_MONTH_DAYS } from "../../src/lib/revenue/money";

const DAY = 86_400;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;

function subscription(overrides: Partial<ZohoSubscription> = {}): ZohoSubscription {
  return {
    subscription_id: "sub_1",
    status: "live",
    amount: 29,
    interval: 1,
    interval_unit: "months",
    currency_code: "USD",
    customer_id: "cust_1",
    ...overrides,
  };
}

function payment(overrides: Partial<ZohoPayment> = {}): ZohoPayment {
  return {
    payment_id: "pay_1",
    date: "2026-10-20",
    status: "success",
    amount: 29,
    amount_refunded: 0,
    currency_code: "USD",
    ...overrides,
  };
}

describe("Zoho Billing connections", () => {
  const refreshToken = "1000.0123456789abcdef.fedcba9876543210";

  it("stores the data centre, the organization and the refresh token together", () => {
    const stored = zohoStoredKey({ dc: "in", organizationId: "60012345678", refreshToken });
    expect(stored).toBe(`in:60012345678:${refreshToken}`);
    expect(readZohoKey(stored)).toEqual({ dc: "in", organizationId: "60012345678", refreshToken });
    expect(readZohoKey(`com.au:7:${refreshToken}`).dc).toBe("com.au");
  });

  it("refuses a stored value of any other form", () => {
    for (const stored of [
      `xx:60012345678:${refreshToken}`,
      `in::${refreshToken}`,
      "in:60012345678:short",
      `in:60012345678:${refreshToken}:extra`,
      refreshToken,
    ])
      expect(() => readZohoKey(stored)).toThrow("The stored Zoho Billing connection is not valid.");
    expect(() => zohoStoredKey({ dc: "in", organizationId: "60:01", refreshToken })).toThrow(
      "Zoho returned access in a form that could not be stored.",
    );
  });

  it("never takes a pasted token", () => {
    expect(() => parseZohoKey()).toThrow(
      "Connect Zoho Billing by approving read access with Zoho.",
    );
    expect(() => zoho.parseKey({ key: refreshToken, account: "" }, { allowTest: true })).toThrow(
      "Pasted Zoho tokens are not accepted here.",
    );
  });

  it("shows the organization's name and the token's last four", () => {
    expect(zohoHint("  Harbor   Labs ", refreshToken)).toBe("Harbor Labs · …3210");
    expect(zohoHint("", refreshToken)).toBe("Zoho Billing · …3210");
    expect(zohoHint("A".repeat(60), refreshToken).length).toBeLessThanOrEqual(40);
  });
});

describe("Zoho data centres", () => {
  const params = (values: Record<string, string>) => new URLSearchParams(values);

  it("come from the accounts server Zoho returns to, or its location", () => {
    expect(callbackDataCentre(params({ "accounts-server": "https://accounts.zoho.in" }))).toBe(
      "in",
    );
    expect(callbackDataCentre(params({ "accounts-server": "https://accounts.zoho.eu/" }))).toBe(
      "eu",
    );
    expect(callbackDataCentre(params({ "accounts-server": "https://accounts.zohocloud.ca" }))).toBe(
      "ca",
    );
    expect(callbackDataCentre(params({ location: "au" }))).toBe("com.au");
    expect(callbackDataCentre(params({}))).toBe("com");
  });

  it("refuse any server that is not one of Zoho's", () => {
    for (const server of ["https://accounts.zoho.evil.com", "http://accounts.zoho.com", "x"])
      expect(() => callbackDataCentre(params({ "accounts-server": server }))).toThrow(
        "Zoho returned an unknown data centre",
      );
    expect(() => callbackDataCentre(params({ location: "mars" }))).toThrow("unknown data centre");
  });
});

describe("Zoho scopes", () => {
  it("are read from commas or spaces", () => {
    expect(scopeList("a.b.READ,c.d.READ")).toEqual(["a.b.READ", "c.d.READ"]);
    expect(scopeList("a.b.READ c.d.READ")).toEqual(["a.b.READ", "c.d.READ"]);
    expect(scopeList(undefined)).toEqual([]);
  });

  it("must hold everything a verification reads, and READ access only", () => {
    expect(readOnlyScopes(ZOHO_SCOPES)).toBe(true);
    expect(readOnlyScopes([...ZOHO_SCOPES, "ZohoSubscriptions.invoices.READ"])).toBe(true);
    expect(readOnlyScopes(ZOHO_SCOPES.slice(1))).toBe(false);
    expect(readOnlyScopes([...ZOHO_SCOPES, "ZohoSubscriptions.subscriptions.UPDATE"])).toBe(false);
    expect(readOnlyScopes([...ZOHO_SCOPES, "ZohoSubscriptions.invoices.ALL"])).toBe(false);
    expect(readOnlyScopes([...ZOHO_SCOPES, "ZohoSubscriptions.fullaccess.all"])).toBe(false);
    expect(readOnlyScopes([])).toBe(false);
  });

  it("are asked for offline, in the US data centre, with a PKCE challenge", () => {
    const saved = [process.env.ZOHO_ACCOUNTS_BASE, process.env.NEXT_PUBLIC_SITE_URL];
    delete process.env.ZOHO_ACCOUNTS_BASE;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const flow = newOAuthFlow("saas-1", "user-1");
    const url = new URL(zohoAuthorizeUrl("client-1", flow));
    expect(url.origin + url.pathname).toBe("https://accounts.zoho.com/oauth/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      scope:
        "ZohoSubscriptions.settings.READ,ZohoSubscriptions.subscriptions.READ,ZohoSubscriptions.payments.READ",
      client_id: "client-1",
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      redirect_uri: "http://localhost:3001/api/zoho/callback",
      state: flow.state,
      code_challenge: pkceChallenge(flow.verifier),
      code_challenge_method: "S256",
    });
    if (saved[0] !== undefined) process.env.ZOHO_ACCOUNTS_BASE = saved[0];
    if (saved[1] !== undefined) process.env.NEXT_PUBLIC_SITE_URL = saved[1];
  });
});

describe("Zoho Billing MRR", () => {
  it("knows weekly, monthly and yearly billing", () => {
    expect(billingMonths(subscription({ interval: 2, interval_unit: "weeks" }))).toBeCloseTo(
      14 / AVERAGE_MONTH_DAYS,
    );
    expect(billingMonths(subscription({ interval: "3", interval_unit: "months" }))).toBe(3);
    expect(billingMonths(subscription({ interval_unit: "years" }))).toBe(12);
    expect(billingMonths(subscription({ interval_unit: "days" }))).toBeNull();
    expect(billingMonths(subscription({ interval: 0 }))).toBeNull();
    expect(billingMonths(subscription({ interval_unit: null }))).toBeNull();
  });

  it("counts live, non-renewing and dunning subscriptions at their charge per month", () => {
    const result = zohoMrr([
      subscription(),
      subscription({ subscription_id: "sub_2", amount: "5.50" }),
      subscription({
        subscription_id: "sub_3",
        customer_id: "cust_2",
        amount: 240,
        interval_unit: "years",
      }),
      subscription({
        subscription_id: "sub_4",
        customer_id: "cust_3",
        status: "non_renewing",
        currency_code: "EUR",
        amount: 8,
      }),
      subscription({
        subscription_id: "sub_5",
        customer_id: "cust_4",
        status: "dunning",
        amount: 30,
        interval: 3,
      }),
      subscription({ subscription_id: "sub_6", customer_id: "cust_5", amount: 0 }),
      ...["trial", "future", "unpaid", "cancelled", "expired", "creation_failed"].map((status) =>
        subscription({ subscription_id: `sub_${status}`, customer_id: status, status }),
      ),
      // The same subscription from two lists counts once.
      subscription(),
    ]);
    expect(result).toEqual({
      byCurrency: { usd: 2900 + 550 + 2000 + 1000, eur: 800 },
      customers: 4,
      subscriptionIds: ["sub_1", "sub_2", "sub_3", "sub_4", "sub_5", "sub_6"],
      skippedItems: 0,
    });
  });

  it("counts minor units as each currency has them", () => {
    const result = zohoMrr([
      subscription({ currency_code: "JPY", amount: 1200 }),
      subscription({ subscription_id: "sub_2", currency_code: "KWD", amount: 10.5 }),
      subscription({
        subscription_id: "sub_3",
        currency_code: "INR",
        amount: 999,
        interval_unit: "years",
      }),
    ]);
    expect(result.byCurrency).toEqual({ jpy: 1200, kwd: 10_500, inr: 99_900 / 12 });
  });

  it("claims but does not value a subscription without a readable price or period", () => {
    const result = zohoMrr([
      subscription({ amount: null }),
      subscription({ subscription_id: "sub_2", amount: "" }),
      subscription({ subscription_id: "sub_3", interval_unit: "decades" }),
      subscription({ subscription_id: "sub_4", currency_code: null }),
      subscription({ subscription_id: "sub_5", amount: "n/a" }),
    ]);
    expect(result).toEqual({
      byCurrency: {},
      customers: 0,
      subscriptionIds: ["sub_1", "sub_2", "sub_3", "sub_4", "sub_5"],
      skippedItems: 5,
    });
  });
});

describe("Zoho Billing revenue", () => {
  it("counts successful payments less refunds, of unknown kind, named by the organization", () => {
    const listed = zohoPayments(
      "600",
      [
        payment(),
        payment({ payment_id: "pay_2", amount: "50.00", amount_refunded: "20.00" }),
        payment({ payment_id: "pay_3", amount: 100, amount_refunded: 100 }),
        payment({ payment_id: "pay_4", status: "failure" }),
        payment({ payment_id: "pay_5", currency_code: null, amount: 15 }),
        payment({ payment_id: "pay_6", currency_code: "JPY", amount: 3000 }),
        payment({ payment_id: "pay_7", date: null }),
        payment({ payment_id: "pay_8", amount: null }),
        payment({ payment_id: 9, date: "2026-10-21T10:00:00+0530" }),
      ],
      "EUR",
    );
    expect(listed).toEqual([
      {
        id: "600:pay_1",
        at: day("2026-10-20"),
        fingerprint: "29:0",
        value: { currency: "usd", amount: 2900 },
        kind: "unknown",
      },
      {
        id: "600:pay_2",
        at: day("2026-10-20"),
        fingerprint: "50:20",
        value: { currency: "usd", amount: 3000 },
        kind: "unknown",
      },
      {
        id: "600:pay_3",
        at: day("2026-10-20"),
        fingerprint: "100:100",
        value: { currency: "usd", amount: 0 },
        kind: "unknown",
      },
      {
        id: "600:pay_5",
        at: day("2026-10-20"),
        fingerprint: "15:0",
        value: { currency: "eur", amount: 1500 },
        kind: "unknown",
      },
      {
        id: "600:pay_6",
        at: day("2026-10-20"),
        fingerprint: "3000:0",
        value: { currency: "jpy", amount: 3000 },
        kind: "unknown",
      },
      {
        id: "600:9",
        at: day("2026-10-21"),
        fingerprint: "29:0",
        value: { currency: "usd", amount: 2900 },
        kind: "unknown",
      },
    ]);
  });

  it("leaves out a payment without a currency where the organization's is unknown", () => {
    expect(zohoPayments("600", [payment({ currency_code: null })], null)).toEqual([]);
  });

  it("keeps the payments of a window, its end excluded", () => {
    const [listed] = zohoPayments("600", [payment()], null);
    expect(inWindow(listed!, day("2026-10-20"), day("2026-10-21"))).toBe(true);
    expect(inWindow(listed!, day("2026-10-20"), null)).toBe(true);
    expect(inWindow(listed!, day("2026-10-21"), null)).toBe(false);
    expect(inWindow(listed!, 0, day("2026-10-20"))).toBe(false);
  });
});

// The whole path against the fake server the browser tests use: approval, the code exchange at the
// founder's data centre, and the reads.
describe("Zoho Billing against its stand-in", () => {
  let server: Server;
  const saved: Record<string, string | undefined> = {};
  const env = (name: string, value: string) => {
    saved[name] = process.env[name];
    process.env[name] = value;
  };

  beforeAll(async () => {
    server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      void handleZoho(url, request, response).then((handled) => {
        if (!handled) response.writeHead(404).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/zoho`;
    env("ZOHO_ACCOUNTS_BASE", `${base}/accounts`);
    env("ZOHO_API_BASE", `${base}/api`);
    env("ZOHO_CLIENT_ID", ZOHO.clientId);
    env("ZOHO_CLIENT_SECRET", "secret");
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(saved))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    await new Promise((resolve) => server.close(resolve));
  });

  const client = () => ({ id: ZOHO.clientId, secret: "secret" });

  // Approves on the stand-in's page and returns the callback's query.
  async function approve(address: string) {
    const response = await fetch(address, { redirect: "manual" });
    const back = new URL(response.headers.get("location")!);
    expect(back.pathname).toBe("/api/zoho/callback");
    return back.searchParams;
  }

  it("connects the default organization at the founder's data centre", async () => {
    const flow = newOAuthFlow("saas-1", "user-1");
    const params = await approve(zohoAuthorizeUrl(ZOHO.clientId, flow));
    expect(params.get("state")).toBe(flow.state);
    expect(params.get("accounts-server")).toBe("https://accounts.zoho.in");
    await expect(
      exchangeZohoCode(client(), { code: params.get("code")!, verifier: "wrong", params }),
    ).rejects.toThrow("Zoho did not complete the connection. Try again.");
    const again = await approve(zohoAuthorizeUrl(ZOHO.clientId, flow));
    expect(
      await exchangeZohoCode(client(), {
        code: again.get("code")!,
        verifier: flow.verifier,
        params: again,
      }),
    ).toEqual({ key: ZOHO.keys.one, hint: "Harbor Labs · …0001", livemode: true });
  });

  it("refuses a grant that can do more than read", async () => {
    const flow = newOAuthFlow("saas-1", "user-1");
    const address = new URL(zohoAuthorizeUrl(ZOHO.clientId, flow));
    address.searchParams.set(
      "scope",
      `${address.searchParams.get("scope")},ZohoSubscriptions.subscriptions.CREATE`,
    );
    const params = await approve(address.toString());
    await expect(
      exchangeZohoCode(client(), { code: params.get("code")!, verifier: flow.verifier, params }),
    ).rejects.toThrow("Zoho granted other access than reading subscriptions and payments");
  });

  it("reads MRR from the counted subscriptions, without history", async () => {
    const now = new Date();
    const reading = await zoho.read(ZOHO.keys.one, true, { allowTest: false, now, history: true });
    expect(reading).toMatchObject({
      livemode: true,
      byCurrency: { usd: 2900 + 500 + 2000 + 1000, eur: 800 },
      customers: 4,
      skippedItems: 1,
      lines: null,
    });
    expect(reading.subscriptionIds).toHaveLength(7);
    expect(reading.historyNote).toContain("no revenue history");
    const light = await zoho.read(ZOHO.keys.one, true, { allowTest: false, now, history: false });
    expect(light).toMatchObject({ customers: 4, lines: null, historyNote: null });
  }, 60_000);

  it("reads revenue from every payment, less refunds", async () => {
    const now = Math.floor(Date.now() / 1000);
    const read = await zoho.payments(ZOHO.keys.one, true, {
      allowTest: false,
      since: 0,
      before: null,
      maxPages: 200,
      stored: () => null,
    });
    expect(read.complete).toBe(true);
    const totals = (since: number) => {
      const byCurrency: Record<string, number> = {};
      for (const p of read.payments.filter((payment) => payment.at >= since))
        byCurrency[p.value!.currency] = (byCurrency[p.value!.currency] ?? 0) + p.value!.amount;
      return byCurrency;
    };
    // $326.50 and $71.50 at 0.8 EUR per USD.
    expect(totals(0)).toEqual({ usd: 31_400, eur: 1_000 });
    expect(totals(now - 30 * DAY)).toEqual({ usd: 5_900, eur: 1_000 });
    expect(read.payments.every((p) => p.id.startsWith(`${ZOHO.organization}:`))).toBe(true);
    const recent = await zoho.payments(ZOHO.keys.one, true, {
      allowTest: false,
      since: now - 50 * DAY,
      before: now - 15 * DAY,
      maxPages: 200,
      stored: () => null,
    });
    expect(recent.payments.map((p) => p.id)).toEqual([
      `${ZOHO.organization}:pay_partial`,
      `${ZOHO.organization}:pay_refunded`,
    ]);
    await expect(
      zoho.payments(ZOHO.keys.one, true, {
        allowTest: false,
        since: 0,
        before: null,
        maxPages: 1,
        stored: () => null,
      }),
    ).rejects.toThrow("The Zoho Billing account has too much data to verify in one run.");
  }, 60_000);

  it("refuses a refresh token that can do more than read, and one Zoho no longer knows", async () => {
    const options = { allowTest: false, now: new Date(), history: false };
    await expect(zoho.read(ZOHO.keys.wide, true, options)).rejects.toThrow(
      "Zoho granted other access than reading subscriptions and payments",
    );
    await expect(
      zoho.read(`in:${ZOHO.organization}:1000.harborzohorefresh.gone001`, true, options),
    ).rejects.toThrow("Zoho no longer accepts the connection.");
  });
});
