// Runs the full read path of every provider (client, MRR, history, FX) against the fake provider
// server that the browser tests use.
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DODO_KEYS, PADDLE_KEYS, POLAR_TOKENS } from "../e2e/fake-billing.mjs";
import { ABACATEPAY } from "../e2e/fake-abacatepay.mjs";
import { AIRWALLEX } from "../e2e/fake-airwallex.mjs";
import { APPSTORE } from "../e2e/fake-appstore.mjs";
import { ASAAS } from "../e2e/fake-asaas.mjs";
import { CHARGEBEE, CREEM_KEYS, REVENUECAT, WHOP_KEYS } from "../e2e/fake-billing-extra.mjs";
import { GOOGLE_PLAY } from "../e2e/fake-googleplay.mjs";
import { GUMROAD } from "../e2e/fake-gumroad.mjs";
import { MOLLIE } from "../e2e/fake-mollie.mjs";
import { PAYPAL } from "../e2e/fake-paypal.mjs";
import { PAYSTACK } from "../e2e/fake-paystack.mjs";
import { SUPERWALL } from "../e2e/fake-superwall.mjs";
import { ZOHO } from "../e2e/fake-zoho.mjs";
import {
  exchangeGumroadCode,
  gumroadAuthorizeUrl,
  newGumroadFlow,
} from "../../src/lib/revenue/gumroad/oauth";
import { adapter } from "../../src/lib/revenue/providers";
import {
  historyToCarry,
  refreshReadsPayments,
  revenueToCarry,
  verifyRevenue,
} from "../../src/lib/revenue/sync";
import type { ProviderId } from "../../src/lib/revenue/catalog";
import type { StoredPayment } from "../../src/lib/revenue/types";

const PORT = 3912;
const base = `http://127.0.0.1:${PORT}`;
let server: ChildProcess;
const healthy = () =>
  fetch(`${base}/health`).then(
    (r) => r.ok,
    () => false,
  );

beforeAll(async () => {
  server = spawn(process.execPath, ["tests/e2e/fake-providers.mjs"], {
    env: { ...process.env, FAKE_PROVIDERS_PORT: String(PORT) },
    stdio: "ignore",
  });
  process.env.STRIPE_API_BASE = base;
  process.env.PADDLE_API_BASE = `${base}/paddle`;
  process.env.POLAR_API_BASE = `${base}/polar`;
  process.env.DODO_API_BASE = `${base}/dodo`;
  process.env.CREEM_API_BASE = `${base}/creem`;
  process.env.CHARGEBEE_API_BASE = `${base}/chargebee`;
  process.env.WHOP_API_BASE = `${base}/whop`;
  process.env.REVENUECAT_API_BASE = `${base}/revenuecat`;
  process.env.PAYPAL_API_BASE = `${base}/paypal`;
  process.env.MOLLIE_API_BASE = `${base}/mollie`;
  process.env.PAYSTACK_API_BASE = `${base}/paystack`;
  process.env.ABACATEPAY_API_BASE = `${base}/abacatepay`;
  process.env.ASAAS_API_BASE = `${base}/asaas`;
  process.env.AIRWALLEX_API_BASE = `${base}/airwallex`;
  process.env.SUPERWALL_API_BASE = `${base}/superwall`;
  process.env.APPSTORE_API_BASE = `${base}/appstore`;
  process.env.GOOGLE_PLAY_API_BASE = `${base}/googleplay`;
  process.env.ZOHO_ACCOUNTS_BASE = `${base}/zoho/accounts`;
  process.env.ZOHO_API_BASE = `${base}/zoho/api`;
  process.env.GUMROAD_API_BASE = `${base}/gumroad`;
  process.env.GUMROAD_OAUTH_BASE = `${base}/gumroad`;
  process.env.ZOHO_CLIENT_ID = ZOHO.clientId;
  process.env.ZOHO_CLIENT_SECRET = "harbor-zoho-secret";
  process.env.FX_API_BASE = base;
  process.env.REVENUE_ALLOW_TEST_KEYS = "true";
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await healthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The fake provider server did not start.");
});

afterAll(() => {
  server?.kill();
});

const sortedMonths = (history: { month: string }[] | null) => {
  const months = history!.map((point) => point.month);
  return [...months].sort().join() === months.join();
};

describe("Stripe verification", () => {
  it("reads MRR and twelve months of invoice history", async () => {
    const result = await verifyRevenue("stripe", "rk_test_harborfixture0001", false);
    expect(result).toMatchObject({
      provider: "stripe",
      livemode: false,
      mrrCents: 10_400,
      customers: 3,
      skippedItems: 1,
      mrrInvoiceCents: 10_400,
      mrr30dAgoCents: 5_400,
      historyNote: null,
    });
    expect(result.history).toHaveLength(12);
    expect(result.history![0].mrr_cents).toBe(2_900);
    expect(result.history!.at(-1)!.mrr_cents).toBe(5_400);
    expect(sortedMonths(result.history)).toBe(true);
  });

  it("still verifies MRR when the key cannot read invoices", async () => {
    const result = await verifyRevenue("stripe", "rk_test_harborfixture0002", false);
    expect(result.mrrCents).toBe(2_900);
    expect(result.history).toBeNull();
    expect(result.mrrInvoiceCents).toBeNull();
    expect(result.historyNote).toMatch(/Invoices: Read/);
  });

  it("takes tax out of a tax-inclusive price, and leaves out a deleted coupon's subscription", async () => {
    const result = await verifyRevenue("stripe", "rk_test_harborfixture0004", false, new Date(), {
      history: false,
    });
    // EUR 12 with EUR 2 of VAT included is EUR 10, $12.50 at 0.8 EUR to the dollar.
    expect(result).toMatchObject({ mrrCents: 1250, customers: 1, currencies: { eur: 1000 } });
    expect(result.subscriptionHashes).toHaveLength(2);
    expect(result.mrrNote).toMatch(/coupon that was deleted in Stripe/);
  });

  it("values a multi-currency price in the currency the subscription pays", async () => {
    const result = await verifyRevenue("stripe", "rk_test_harborfixture0003", false);
    expect(result).toMatchObject({
      mrrCents: 4500,
      customers: 1,
      currencies: { eur: 3600 },
      history: null,
    });
    expect(result.historyNote).toBe(
      "Revenue history needs the Invoices: Read permission on the restricted key.",
    );
  });
});

describe("Paddle verification", () => {
  it("values subscriptions by their latest full charge, without tax or ended discounts", async () => {
    const result = await verifyRevenue("paddle", PADDLE_KEYS.one, null);
    expect(result).toMatchObject({
      provider: "paddle",
      livemode: false,
      mrrCents: 18_250,
      customers: 3,
      skippedItems: 1,
      currencies: { usd: 12_000, eur: 5_000 },
      mrrInvoiceCents: 12_000,
      mrr30dAgoCents: 17_000,
      historyNote: null,
    });
    expect(result.subscriptionHashes).toHaveLength(4);
    expect(result.history).toHaveLength(12);
    expect(result.history![0].mrr_cents).toBe(3_000);
    expect(sortedMonths(result.history)).toBe(true);
  });

  it("reads the last month for all, and older charges only for the subscriptions that need them", async () => {
    await fetch(`${base}/paddle/requests`);
    const result = await verifyRevenue("paddle", PADDLE_KEYS.one, false, new Date(), {
      history: false,
    });
    expect(result).toMatchObject({ mrrCents: 18_250, customers: 3, skippedItems: 1 });
    // The yearly, the past-due and the imported subscription have no full charge in the last
    // month, so their own charges are asked for; the monthly one's is there.
    const filters = (await (await fetch(`${base}/paddle/requests`)).json()) as (string[] | null)[];
    expect(filters).toEqual([null, ["sub_paddle_yearly", "sub_paddle_eur", "sub_paddle_imported"]]);
  });

  it("names the missing permission", async () => {
    await expect(verifyRevenue("paddle", PADDLE_KEYS.noperm, false)).rejects.toThrow(
      /missing a read permission/,
    );
  });

  it("refuses a sandbox key on the live API", async () => {
    await expect(verifyRevenue("paddle", PADDLE_KEYS.one, true)).rejects.toThrow(
      /Paddle rejected the key/,
    );
  });
});

describe("Polar verification", () => {
  it("finds the sandbox, and counts amounts without first-period discounts or included tax", async () => {
    const result = await verifyRevenue("polar", POLAR_TOKENS.one, null);
    expect(result).toMatchObject({
      provider: "polar",
      livemode: false,
      mrrCents: 5_917,
      customers: 3,
      skippedItems: 0,
      mrrInvoiceCents: 5_250,
      mrr30dAgoCents: 4_000,
      historyNote: null,
    });
    expect(result.subscriptionHashes).toHaveLength(3);
    expect(result.history![0].mrr_cents).toBe(2_000);
  });

  it("refuses an unknown token", async () => {
    await expect(verifyRevenue("polar", `polar_oat_${"x".repeat(43)}`, null)).rejects.toThrow(
      /Polar rejected the token/,
    );
  });
});

describe("Dodo Payments verification", () => {
  it("counts recurring amounts without included tax, and has no history", async () => {
    const result = await verifyRevenue("dodo", DODO_KEYS.one, null);
    expect(result).toMatchObject({
      provider: "dodo",
      livemode: false,
      mrrCents: 5_000,
      customers: 3,
      skippedItems: 0,
      currencies: { usd: 2_500, eur: 2_000 },
      history: null,
      mrrInvoiceCents: null,
    });
    expect(result.subscriptionHashes).toHaveLength(3);
    expect(result.historyNote).toMatch(/does not say which period/);
  });

  it("refuses an unknown key", async () => {
    await expect(verifyRevenue("dodo", "dodo_test_unknown_key_0000", null)).rejects.toThrow(
      /Dodo Payments rejected the key/,
    );
  });
});

const chargebeeKey = `${CHARGEBEE.site}:${CHARGEBEE.key}`;
const revenueCatKey = (key: string) => `${REVENUECAT.project}:${key}`;
const paypalKey = (app: { clientId: string; secret: string }) => `${app.clientId}:${app.secret}`;
const airwallexKey = (key: { clientId: string; apiKey: string }) => `${key.clientId}:${key.apiKey}`;
const superwallKey = (key: string) => `${SUPERWALL.application}:${key}`;
const appStoreKey = (key: { issuer: string; keyId: string; vendor: string; privateKey: string }) =>
  adapter("appstore").parseKey(
    { key: key.privateKey, account: key.issuer, extra: [key.keyId, key.vendor] },
    { allowTest: true },
  ).key;
const googlePlayKey = (json: string) =>
  adapter("googleplay").parseKey(
    { key: json, account: GOOGLE_PLAY.uri, extra: [GOOGLE_PLAY.packageName] },
    { allowTest: true },
  ).key;
const mollieKey = (token: string) => `${MOLLIE.profile}:${token}`;

describe("Creem verification", () => {
  it("values subscriptions by their products, without included tax, with history", async () => {
    const result = await verifyRevenue("creem", CREEM_KEYS.one, false);
    expect(result).toMatchObject({
      provider: "creem",
      livemode: false,
      mrrCents: 3_542,
      customers: 2,
      skippedItems: 0,
      mrrInvoiceCents: 3_542,
      mrr30dAgoCents: 2_500,
      historyNote: null,
    });
    expect(result.currencies.usd).toBe(2_500);
    expect(result.currencies.eur).toBe(833);
    expect(result.history).toHaveLength(12);
    expect(result.history!.every((point) => point.mrr_cents === 2_500)).toBe(true);
    expect(result.subscriptionHashes).toHaveLength(2);
  });

  it("refuses an unknown key", async () => {
    await expect(verifyRevenue("creem", "creem_test_unknownkey0000", false)).rejects.toThrow(
      /Creem refused the request/,
    );
  });
});

describe("Chargebee verification", () => {
  it("values subscriptions by their latest full invoice, with history", async () => {
    const result = await verifyRevenue("chargebee", chargebeeKey, false);
    expect(result).toMatchObject({
      provider: "chargebee",
      livemode: false,
      mrrCents: 3_521,
      customers: 2,
      skippedItems: 1,
      mrrInvoiceCents: 3_521,
      mrr30dAgoCents: 3_000,
      historyNote: null,
    });
    expect(result.history!.every((point) => point.mrr_cents === 3_000)).toBe(true);
    expect(result.subscriptionHashes).toHaveLength(3);
  });

  it("names a site Chargebee does not know, and refuses a wrong key", async () => {
    await expect(
      verifyRevenue("chargebee", `nosuchsite-test:${CHARGEBEE.key}`, false),
    ).rejects.toThrow(/no site called nosuchsite-test/);
    await expect(
      verifyRevenue("chargebee", `${CHARGEBEE.site}:test_wrongkey000000000000`, false),
    ).rejects.toThrow(/Chargebee rejected the key/);
  });
});

describe("Whop verification", () => {
  it("finds the sandbox, and values memberships by renewals, plans and promo codes", async () => {
    const result = await verifyRevenue("whop", WHOP_KEYS.one, null);
    expect(result).toMatchObject({
      provider: "whop",
      livemode: false,
      mrrCents: 3_667,
      customers: 3,
      skippedItems: 0,
      mrrInvoiceCents: 2_167,
      mrr30dAgoCents: 3_000,
      historyNote: null,
    });
    expect(result.history![0].mrr_cents).toBe(1_500);
    expect(result.subscriptionHashes).toHaveLength(3);
  });

  it("refuses a key that can do more than read", async () => {
    await expect(verifyRevenue("whop", WHOP_KEYS.writer, null)).rejects.toThrow(
      /more than read, for example plan:update/,
    );
  });
});

describe("RevenueCat verification", () => {
  it("reads MRR, active subscriptions and history from the charts", async () => {
    const result = await verifyRevenue("revenuecat", revenueCatKey(REVENUECAT.keys.one), true);
    expect(result).toMatchObject({
      provider: "revenuecat",
      livemode: true,
      mrrCents: 15_000,
      customers: 42,
      skippedItems: 0,
      mrrInvoiceCents: 15_000,
      mrr30dAgoCents: 10_000,
      historyNote: null,
    });
    expect(result.history!.every((point) => point.mrr_cents === 10_000)).toBe(true);
    expect(result.history).toHaveLength(12);
  });

  it("refuses a key with access beyond charts, and a project the key does not belong to", async () => {
    await expect(
      verifyRevenue("revenuecat", revenueCatKey(REVENUECAT.keys.wide), true),
    ).rejects.toThrow(/more access than charts/);
    await expect(
      verifyRevenue("revenuecat", `projother1:${REVENUECAT.keys.one}`, true),
    ).rejects.toThrow(/cannot read this project's charts/);
  });
});

describe("PayPal verification", () => {
  it("finds the sandbox, and values subscriptions by their payments, with history", async () => {
    const result = await verifyRevenue("paypal", paypalKey(PAYPAL.one), null);
    expect(result).toMatchObject({
      provider: "paypal",
      livemode: false,
      mrrCents: 4_042,
      customers: 3,
      skippedItems: 0,
      currencies: { usd: 3_000, eur: 833 },
      mrrInvoiceCents: 4_042,
      mrr30dAgoCents: 4_042,
      historyNote: null,
      mrrNote: "1 subscription counts as yearly until its next payment shows how often it renews.",
    });
    expect(result.history).toHaveLength(12);
    expect(sortedMonths(result.history)).toBe(true);
    expect(result.history![0].mrr_cents).toBe(2_000);
    expect(result.subscriptionHashes).toHaveLength(3);
  }, 20_000);

  it("refuses an app that can do more than search, and credentials of no app", async () => {
    await expect(verifyRevenue("paypal", paypalKey(PAYPAL.wide), null)).rejects.toThrow(
      /can do more than search transactions/,
    );
    await expect(
      verifyRevenue("paypal", `${PAYPAL.one.clientId}:wrongSecretForTheApp000`, null),
    ).rejects.toThrow(/PayPal refused the Client ID and secret/);
    // A sandbox app is not a live one.
    await expect(verifyRevenue("paypal", paypalKey(PAYPAL.one), true)).rejects.toThrow(
      /PayPal refused the Client ID and secret/,
    );
  });
});

describe("Mollie verification", () => {
  it("finds test mode, and values active subscriptions over their intervals, with history", async () => {
    const result = await verifyRevenue("mollie", mollieKey(MOLLIE.tokens.one), null);
    expect(result).toMatchObject({
      provider: "mollie",
      livemode: false,
      mrrCents: 6_000,
      customers: 3,
      skippedItems: 0,
      currencies: { eur: 4_000, usd: 1_000 },
      mrrInvoiceCents: 6_000,
      mrr30dAgoCents: 6_000,
      historyNote: null,
    });
    expect(result.history).toHaveLength(12);
    expect(sortedMonths(result.history)).toBe(true);
    expect(result.history![0].mrr_cents).toBe(2_500);
    expect(result.subscriptionHashes).toHaveLength(3);
  }, 20_000);

  it("refuses a token that can do more than read, and an API key", async () => {
    await expect(verifyRevenue("mollie", mollieKey(MOLLIE.tokens.wide), null)).rejects.toThrow(
      /can do more than read/,
    );
    expect(() =>
      adapter("mollie").parseKey(
        { key: "live_HarborMollieApiKey000000000", account: MOLLIE.profile },
        { allowTest: true },
      ),
    ).toThrow(/Mollie API key/);
  });
});

describe("Paystack verification", () => {
  it("values active, non-renewing and failed renewals over their plans, with history", async () => {
    for (const key of [PAYSTACK.one, PAYSTACK.plans]) {
      const result = await verifyRevenue("paystack", key, false);
      expect(result).toMatchObject({
        provider: "paystack",
        livemode: false,
        mrrCents: 4_000,
        customers: 3,
        skippedItems: 0,
        currencies: { usd: 4_000 },
        mrrInvoiceCents: 3_000,
        mrr30dAgoCents: 3_000,
      });
      expect(result.history![0].mrr_cents).toBe(2_000);
    }
  }, 20_000);

  it("refuses a secret key before sending anything", () => {
    expect(() =>
      adapter("paystack").parseKey({ key: PAYSTACK.secret, account: "" }, { allowTest: true }),
    ).toThrow(/secret key/);
  });
});

describe("AbacatePay verification", () => {
  it("reads AbacatePay's own MRR and daily history in BRL", async () => {
    const result = await verifyRevenue("abacatepay", ABACATEPAY.one, true);
    expect(result).toMatchObject({
      provider: "abacatepay",
      livemode: true,
      mrrCents: 10_000,
      customers: 4,
      skippedItems: 0,
      currencies: { brl: 50_000 },
      mrrInvoiceCents: 10_000,
      mrr30dAgoCents: 10_000,
    });
    expect(result.history![0].mrr_cents).toBe(5_000);
    expect(result.history!.at(-1)!.mrr_cents).toBe(10_000);
    expect(result.subscriptionHashes).toHaveLength(1);
  }, 20_000);

  it("refuses an API key before sending anything", () => {
    expect(() =>
      adapter("abacatepay").parseKey({ key: ABACATEPAY.wide, account: "" }, { allowTest: true }),
    ).toThrow(/AbacatePay API key/);
  });
});

describe("Asaas verification", () => {
  it("finds the sandbox, and counts subscriptions a paid charge covers, with history", async () => {
    const result = await verifyRevenue("asaas", ASAAS.one, null);
    expect(result).toMatchObject({
      provider: "asaas",
      livemode: false,
      mrrCents: 5_798,
      customers: 2,
      skippedItems: 1,
      currencies: { brl: 28_990 },
      mrrInvoiceCents: 5_798,
      mrr30dAgoCents: 5_798,
    });
    expect(result.history![0].mrr_cents).toBe(2_798);
    expect(result.history!.at(-1)!.mrr_cents).toBe(5_798);
  }, 20_000);

  it("refuses a key created without permissions", async () => {
    await expect(verifyRevenue("asaas", ASAAS.wide, null)).rejects.toThrow(
      /can read more than subscriptions and charges/,
    );
  });
});

describe("Airwallex verification", () => {
  it("finds the sandbox, and values Billing subscriptions by their prices, with history", async () => {
    const result = await verifyRevenue("airwallex", airwallexKey(AIRWALLEX.one), null);
    expect(result).toMatchObject({
      provider: "airwallex",
      livemode: false,
      mrrCents: 8_000,
      customers: 3,
      skippedItems: 2,
      mrrInvoiceCents: 3_000,
      mrr30dAgoCents: 3_000,
    });
    expect(result.history![0].mrr_cents).toBe(2_000);
    expect(result.history!.at(-1)!.mrr_cents).toBe(3_000);
  }, 20_000);

  it("refuses a key that can read more than subscriptions, invoices and payments", async () => {
    await expect(verifyRevenue("airwallex", airwallexKey(AIRWALLEX.wide), null)).rejects.toThrow(
      /can read more than subscriptions, invoices and payments/,
    );
  });
});

describe("Superwall verification", () => {
  it("reads MRR, active subscriptions and history from the charts", async () => {
    const result = await verifyRevenue("superwall", superwallKey(SUPERWALL.one), true);
    expect(result).toMatchObject({
      provider: "superwall",
      livemode: true,
      mrrCents: 12_050,
      customers: 15,
      skippedItems: 0,
      currencies: { usd: 12_050 },
      mrrInvoiceCents: 12_050,
      mrr30dAgoCents: 10_000,
    });
    expect(result.history![0].mrr_cents).toBe(10_000);
    expect(result.subscriptionHashes).toHaveLength(1);
  }, 20_000);

  it("refuses a key with access beyond charts", async () => {
    await expect(verifyRevenue("superwall", superwallKey(SUPERWALL.wide), true)).rejects.toThrow(
      /more access than charts/,
    );
  });
});

describe("App Store verification", () => {
  it("values standard-price subscriptions from the daily report, with history", async () => {
    const result = await verifyRevenue("appstore", appStoreKey(APPSTORE.one), true);
    expect(result).toMatchObject({
      provider: "appstore",
      livemode: true,
      mrrCents: 18_000,
      customers: 18,
      skippedItems: 3,
      currencies: { usd: 13_000, eur: 4_000 },
      mrrInvoiceCents: 18_000,
      mrr30dAgoCents: 13_000,
    });
    expect(result.history![0].mrr_cents).toBe(10_000);
    expect(result.subscriptionHashes).toHaveLength(2);
  }, 30_000);

  it("refuses an Admin key, and reads $0 for a team without subscriptions", async () => {
    await expect(verifyRevenue("appstore", appStoreKey(APPSTORE.wide), true)).rejects.toThrow(
      /can do more than download reports/,
    );
    const none = await verifyRevenue("appstore", appStoreKey(APPSTORE.none), true, new Date(), {
      history: false,
    });
    expect(none.mrrCents).toBe(0);
  }, 30_000);
});

describe("Google Play verification", () => {
  it("values order chains by their latest charge over their plan's period, with history", async () => {
    const result = await verifyRevenue("googleplay", googlePlayKey(GOOGLE_PLAY.one), true);
    expect(result).toMatchObject({
      provider: "googleplay",
      livemode: true,
      mrrCents: 6_042,
      customers: 4,
      skippedItems: 0,
      mrrInvoiceCents: 6_042,
      mrr30dAgoCents: 4_042,
    });
    expect(result.mrrNote).toMatch(/yearly/);
    expect(result.history![0].mrr_cents).toBe(2_000);
  }, 20_000);

  it("refuses a token that can do more than read Cloud Storage", async () => {
    await expect(
      verifyRevenue("googleplay", googlePlayKey(GOOGLE_PLAY.wide), true),
    ).rejects.toThrow(/more access than reading Cloud Storage/);
  });
});

describe("Zoho Billing verification", () => {
  it("reads the default organization's subscriptions in its data centre, without history", async () => {
    const result = await verifyRevenue("zoho", ZOHO.keys.one, true);
    expect(result).toMatchObject({
      provider: "zoho",
      livemode: true,
      mrrCents: 7_400,
      customers: 4,
      skippedItems: 1,
      history: null,
      mrrInvoiceCents: null,
    });
    expect(result.historyNote).toMatch(/no revenue history/);
    expect(result.subscriptionHashes).toHaveLength(7);
  }, 30_000);

  it("refuses a token that can change subscriptions", async () => {
    await expect(verifyRevenue("zoho", ZOHO.keys.wide, true)).rejects.toThrow(/read/);
  }, 30_000);
});

describe("claims", () => {
  it("hash Stripe ids as before and prefix other providers", async () => {
    const { createHash } = await import("node:crypto");
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const stripe = await verifyRevenue("stripe", "rk_test_harborfixture0002", false);
    expect(stripe.subscriptionHashes).toContain(hash("sub_fixture_1"));
    const dodo = await verifyRevenue("dodo", DODO_KEYS.one, false);
    expect(dodo.subscriptionHashes).toContain(hash("dodo:sub_dodo_monthly"));
    const revenueCat = await verifyRevenue("revenuecat", revenueCatKey(REVENUECAT.keys.one), true);
    expect(revenueCat.subscriptionHashes).toEqual([hash("revenuecat:project:projharbor1")]);
  });
});

describe("hourly verification", () => {
  // Requests to one provider are spaced out as in production, so some providers take seconds.
  it.each([
    ["stripe", "rk_test_harborfixture0001"],
    ["paddle", PADDLE_KEYS.one],
    ["polar", POLAR_TOKENS.one],
    ["dodo", DODO_KEYS.one],
    ["creem", CREEM_KEYS.one],
    ["chargebee", chargebeeKey],
    ["whop", WHOP_KEYS.one],
    ["revenuecat", revenueCatKey(REVENUECAT.keys.one)],
    ["paypal", paypalKey(PAYPAL.one)],
    ["mollie", mollieKey(MOLLIE.tokens.one)],
    ["paystack", PAYSTACK.one],
    ["abacatepay", ABACATEPAY.one],
    ["asaas", ASAAS.one],
    ["airwallex", airwallexKey(AIRWALLEX.one)],
    ["superwall", superwallKey(SUPERWALL.one)],
    ["appstore", appStoreKey(APPSTORE.one)],
    ["googleplay", googlePlayKey(GOOGLE_PLAY.one)],
    ["zoho", ZOHO.keys.one],
  ] as const)(
    "reads only what MRR needs from %s without the history",
    async (provider, key) => {
      const full = await verifyRevenue(provider, key, false);
      const light = await verifyRevenue(provider, key, false, new Date(), { history: false });
      expect(light.mrrCents).toBe(full.mrrCents);
      expect(light.customers).toBe(full.customers);
      expect(light).toMatchObject({
        history: null,
        mrrInvoiceCents: null,
        historyNote: null,
        historyAt: null,
      });
      expect(full.historyAt).not.toBeNull();
    },
    20_000,
  );

  it("carries over a history from the same provider read less than a day ago", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    const latest = {
      provider: "paddle",
      history: [{ month: "2026-08", mrr_cents: 100 }],
      mrr_invoice_cents: 120,
      mrr_30d_ago_cents: 100,
      history_at: "2026-09-25T00:00:00Z",
    };
    expect(historyToCarry(latest, "paddle", now)).toEqual({
      history: [{ month: "2026-08", mrr_cents: 100 }],
      mrrInvoiceCents: 120,
      mrr30dAgoCents: 100,
      historyAt: "2026-09-25T00:00:00Z",
    });
    expect(
      historyToCarry({ ...latest, history_at: "2026-09-24T12:00:00Z" }, "paddle", now),
    ).toBeNull();
    expect(historyToCarry(latest, "polar", now)).toBeNull();
    expect(historyToCarry({ ...latest, history_at: null }, "paddle", now)).toBeNull();
    expect(historyToCarry(null, "paddle", now)).toBeNull();
  });
});

describe("revenue carried over", () => {
  it("carries over figures and months from the same provider read less than two days ago", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    const months = [{ month: "2026-08", cents: 900, subscription_cents: 800, one_time_cents: 100 }];
    const latest = {
      provider: "paddle",
      history: null,
      mrr_invoice_cents: null,
      mrr_30d_ago_cents: null,
      history_at: null,
      revenue_30d_cents: 1000,
      revenue_12m_cents: null,
      revenue_total_cents: null,
      revenue_history: months,
      revenue_at: "2026-09-24T00:00:00Z",
    };
    expect(revenueToCarry(latest, "paddle", now)).toEqual({
      days30Cents: 1000,
      months12Cents: null,
      totalCents: null,
      history: months,
      at: "2026-09-24T00:00:00Z",
    });
    expect(revenueToCarry({ ...latest, revenue_history: null }, "paddle", now)?.history).toBeNull();
    expect(revenueToCarry({ ...latest, revenue_at: "2026-09-23T11:00:00Z" }, "paddle", now)).toBe(
      null,
    );
    expect(revenueToCarry(latest, "stripe", now)).toBeNull();
    expect(revenueToCarry({ ...latest, revenue_at: null }, "paddle", now)).toBeNull();
  });
});

describe("a founder's refresh", () => {
  it("reads payments when they were not read in the last hour", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    expect(refreshReadsPayments(null, now)).toBe(true);
    expect(refreshReadsPayments("2026-09-25T10:59:00Z", now)).toBe(true);
    expect(refreshReadsPayments("2026-09-25T11:30:00Z", now)).toBe(false);
  });
});

describe("payments", () => {
  const DAY = 86_400;
  // The last six months, as every read lists them again.
  async function recent(
    provider: ProviderId,
    key: string,
    {
      livemode = false,
      maxPages = 200,
      stored = () => null,
    }: {
      livemode?: boolean;
      maxPages?: number;
      stored?: (id: string) => StoredPayment | null;
    } = {},
  ) {
    const now = Math.floor(Date.now() / 1000);
    const read = await adapter(provider).payments(key, livemode, {
      allowTest: true,
      since: now - 183 * DAY,
      before: null,
      maxPages,
      stored,
    });
    const values = Object.fromEntries(
      read.payments.map((payment) => [
        payment.id,
        payment.value && {
          currency: payment.value.currency.toLowerCase(),
          amount: Math.round(payment.value.amount),
        },
      ]),
    );
    const kinds = Object.fromEntries(read.payments.map((payment) => [payment.id, payment.kind]));
    return { ...read, values, kinds };
  }
  const usd = (amount: number) => ({ currency: "usd", amount });
  const eur = (amount: number) => ({ currency: "eur", amount });

  it("reads Stripe charges after refunds and lost disputes, without tax", async () => {
    const { complete, values, kinds } = await recent("stripe", "rk_test_harborfixture0001");
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      ch_monthly_0: usd(2900),
      ch_yearly: usd(35000),
      ch_eur: eur(4000),
      ch_ebook: usd(1000),
      ch_refunded: usd(0),
      ch_partial: usd(2000),
      ch_disputed: usd(0),
    });
    expect(values).not.toHaveProperty("ch_failed");
    expect(values).not.toHaveProperty("ch_auth");
    // Charges of subscription invoices paid for subscriptions; Checkout and direct charges did not.
    expect(kinds).toMatchObject({
      ch_monthly_0: "subscription",
      ch_yearly: "subscription",
      ch_eur: "subscription",
      ch_ebook: "one_time",
      ch_partial: "one_time",
    });
  });

  it("leaves unchanged Stripe charges unvalued and keeps a changed one's share of tax", async () => {
    const stored = new Map<string, StoredPayment>([
      ["ch_ebook", { fingerprint: "1200:0:0", amount: 1000, kind: "one_time" }],
      // Stored while EUR 12 of it was refunded, a refund Stripe has since reversed.
      ["ch_eur", { fingerprint: "4800:1200:0", amount: 3000, kind: "subscription" }],
      // Stored before kinds were read: valued again with its invoice, which gives its kind.
      ["ch_monthly_0", { fingerprint: "2900:0:0", amount: 2900, kind: null }],
    ]);
    const { values, kinds } = await recent("stripe", "rk_test_harborfixture0001", {
      stored: (id) => stored.get(id) ?? null,
    });
    expect(values.ch_ebook).toBeNull();
    expect(kinds.ch_ebook).toBeNull();
    expect(values.ch_eur).toEqual(eur(4000));
    expect(kinds.ch_eur).toBe("subscription");
    expect(values.ch_monthly_0).toEqual(usd(2900));
    expect(kinds.ch_monthly_0).toBe("subscription");
  });

  it("names the Stripe permission revenue needs", async () => {
    await expect(recent("stripe", "rk_test_harborfixture0002")).rejects.toThrow(
      "Revenue beyond MRR needs the Charges: Read permission on the restricted key.",
    );
  });

  it("reads Paddle transactions after adjustments, without tax", async () => {
    const { complete, values, kinds } = await recent("paddle", PADDLE_KEYS.one);
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      txn_monthly_0: usd(3000),
      txn_yearly: usd(108000),
      txn_eur: eur(4000),
      txn_one_off: usd(9900),
      txn_refunded: usd(0),
    });
    expect(kinds).toMatchObject({ txn_monthly_0: "subscription", txn_one_off: "one_time" });
  });

  it("reads Polar orders, one-time purchases included", async () => {
    const { complete, values, kinds } = await recent("polar", POLAR_TOKENS.one);
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      ord_monthly_0: usd(2500),
      ord_yearly: usd(24000),
      ord_eur: eur(1000),
      ord_once: usd(1500),
      ord_refunded: usd(0),
    });
    expect(kinds).toMatchObject({ ord_monthly_0: "subscription", ord_once: "one_time" });
  });

  it("reads Dodo payments one at a time, and only those new or changed", async () => {
    const { complete, values, kinds } = await recent("dodo", DODO_KEYS.one);
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      pay_monthly_0: usd(1500),
      pay_yearly: usd(12000),
      pay_eur: eur(2000),
      pay_once: usd(2500),
      pay_refunded: usd(0),
      pay_disputed: usd(0),
    });
    expect(kinds).toMatchObject({ pay_monthly_0: "subscription", pay_once: "one_time" });
    // An unchanged payment is not read again, but the list still tells its kind.
    const again = await recent("dodo", DODO_KEYS.one, {
      stored: (id) =>
        id === "pay_once" ? { fingerprint: "3000::", amount: 2500, kind: null } : null,
    });
    expect(again.values.pay_once).toBeNull();
    expect(again.kinds.pay_once).toBe("one_time");
  }, 30_000);

  it("goes on with Dodo payments in the next run once the requests of one run are spent", async () => {
    const { complete, from, payments } = await recent("dodo", DODO_KEYS.one, { maxPages: 4 });
    expect(complete).toBe(false);
    expect(from).toBeDefined();
    // Every payment it valued comes back, those of the unfinished day too, so they are stored.
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.every((payment) => payment.value)).toBe(true);
  }, 30_000);

  it("reads Creem transactions after refunds, without tax", async () => {
    const { complete, values, kinds } = await recent("creem", CREEM_KEYS.one);
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      tran_monthly_0: usd(2500),
      tran_once: usd(5000),
      tran_yearly: eur(10000),
      tran_refund: eur(1000),
      tran_chargeback: usd(0),
    });
    expect(kinds).toMatchObject({ tran_monthly_0: "subscription", tran_once: "one_time" });
  });

  it("reads Chargebee invoices with a payment, less cash refunds", async () => {
    const { complete, values, kinds } = await recent("chargebee", chargebeeKey);
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      "harbor-test:cb_inv_0": usd(2700),
      "harbor-test:cb_inv_yearly": eur(5000),
      "harbor-test:cb_inv_once": usd(2000),
      "harbor-test:cb_inv_refunded": usd(0),
    });
    expect(kinds).toMatchObject({
      "harbor-test:cb_inv_0": "subscription",
      "harbor-test:cb_inv_once": "one_time",
    });
  });

  it("reads Whop payments after refunds, without tax", async () => {
    const { complete, values, kinds } = await recent("whop", WHOP_KEYS.one);
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      pay_w1_0: usd(1500),
      pay_w2: eur(6400),
      pay_w3: usd(1500),
      pay_w_once: usd(4000),
      pay_w_refund: usd(0),
    });
    expect(kinds).toMatchObject({ pay_w1_0: "subscription", pay_w_once: "one_time" });
  });

  it("reads RevenueCat's revenue chart a day at a time", async () => {
    const { complete, values, kinds, payments } = await recent(
      "revenuecat",
      revenueCatKey(REVENUECAT.keys.one),
      { livemode: true },
    );
    expect(complete).toBe(true);
    const day = new Date(Date.now() - 10 * DAY * 1000).toISOString().slice(0, 10);
    expect(values[`projharbor1:${day}`]).toEqual(usd(500));
    expect(kinds[`projharbor1:${day}`]).toBe("unknown");
    expect(payments.length).toBeGreaterThanOrEqual(183);
  });

  it("reads PayPal payments from customers after refunds, without tax", async () => {
    const { complete, values, kinds } = await recent("paypal", paypalKey(PAYPAL.one));
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      PPMONTHLY0: usd(2000),
      PPYEARLY: eur(10000),
      PPQUARTER2: usd(3000),
      PPCHECKOUT: usd(4000),
      PPPARTIAL: usd(2000),
      PPREFUNDED: usd(0),
      PPSUBREFUND: usd(0),
    });
    for (const id of ["PPDONATION", "PPWITHDRAWAL", "PPOUTGOING", "PPPARTIALREFUND"])
      expect(values).not.toHaveProperty(id);
    expect(kinds).toMatchObject({ PPMONTHLY0: "subscription", PPCHECKOUT: "one_time" });
  }, 20_000);

  it("goes on with PayPal in the next run, and stops at the three years PayPal lists", async () => {
    const { complete, from, payments } = await recent("paypal", paypalKey(PAYPAL.one), {
      maxPages: 2,
    });
    expect(complete).toBe(false);
    expect(from).toBeGreaterThan(Math.floor(Date.now() / 1000) - 61 * DAY);
    // Only the 30 days read whole come back.
    expect(payments.every((payment) => payment.at >= from!)).toBe(true);
    const older = await adapter("paypal").payments(paypalKey(PAYPAL.one), false, {
      allowTest: true,
      since: 0,
      before: Math.floor(Date.now() / 1000) - 183 * DAY,
      maxPages: 100,
      stored: () => null,
    });
    expect(older.complete).toBe(true);
    expect(older.payments.map((payment) => payment.id)).toContain("PPMONTHLY13");
  }, 30_000);

  it("reads Mollie payments after refunds and chargebacks, without line VAT", async () => {
    const { complete, values, kinds } = await recent("mollie", mollieKey(MOLLIE.tokens.one));
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      tr_HarborMonthly0: eur(2000),
      tr_HarborOnce: eur(10000),
      tr_HarborPartial: usd(2000),
      tr_HarborRefunded: eur(0),
      tr_HarborChargeback: usd(0),
    });
    for (const id of ["tr_HarborFailed", "tr_HarborOpen"]) expect(values).not.toHaveProperty(id);
    expect(kinds).toMatchObject({ tr_HarborMonthly0: "subscription", tr_HarborOnce: "one_time" });
  }, 20_000);

  it("reads Paystack transactions at the requested amount, less refunds", async () => {
    const { complete, values, kinds } = await recent("paystack", PAYSTACK.one);
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      "5000000001": usd(2000),
      "6000000001": usd(5000),
      "6000000002": usd(2000),
      "6000000003": usd(0),
      "6000000004": usd(4000),
    });
    expect(values).not.toHaveProperty("6000000005");
    expect(kinds).toMatchObject({ "5000000001": "subscription", "6000000001": "one_time" });
  }, 20_000);

  it("reads Asaas charges once paid, less refunds, without transfers or cash", async () => {
    const { complete, values, kinds } = await recent("asaas", ASAAS.one);
    expect(complete).toBe(true);
    const brl = (amount: number) => ({ currency: "brl", amount });
    expect(values).toMatchObject({
      pay_monthly0: brl(9_990),
      pay_link: brl(20_000),
      pay_partial: brl(10_000),
      pay_refunded: brl(0),
      pay_card: brl(6_000),
    });
    for (const id of ["pay_pixIn", "pay_cash"]) expect(values).not.toHaveProperty(id);
    expect(kinds).toMatchObject({ pay_monthly0: "subscription", pay_link: "one_time" });
  }, 20_000);

  it("reads Airwallex payments less refunds, and invoices' tax", async () => {
    const { complete, values, kinds } = await recent("airwallex", airwallexKey(AIRWALLEX.one));
    expect(complete).toBe(true);
    expect(values).toMatchObject({
      int_inv_monthly_0: usd(2000),
      int_inv_yearly: usd(12000),
      int_checkout: usd(3500),
      int_refunded: usd(0),
    });
    expect(values).not.toHaveProperty("int_abandoned");
    expect(kinds).toMatchObject({ int_inv_monthly_0: "subscription", int_checkout: "one_time" });
  }, 20_000);

  it("reads Superwall's proceeds as one payment a day", async () => {
    const { complete, values, kinds } = await recent("superwall", superwallKey(SUPERWALL.one), {
      livemode: true,
    });
    expect(complete).toBe(true);
    const day = (back: number) =>
      new Date(Date.now() - back * DAY * 1000).toISOString().slice(0, 10);
    expect(values[`${SUPERWALL.application}:${day(1)}`]).toEqual(usd(840));
    expect(kinds[`${SUPERWALL.application}:${day(1)}`]).toBe("unknown");
  }, 20_000);

  it("reads App Store sales per day, currency and kind, less refunds", async () => {
    // One request per day, so the test reads two weeks rather than six months.
    const now = Math.floor(Date.now() / 1000);
    const read = await adapter("appstore").payments(appStoreKey(APPSTORE.one), true, {
      allowTest: true,
      since: now - 14 * DAY,
      before: null,
      maxPages: 200,
      stored: () => null,
    });
    expect(read.complete).toBe(true);
    const values = Object.fromEntries(read.payments.map((p) => [p.id, p.value]));
    const kinds = Object.fromEntries(read.payments.map((p) => [p.id, p.kind]));
    const day = (back: number) => new Date((now - back * DAY) * 1000).toISOString().slice(0, 10);
    const vendor = APPSTORE.one.vendor;
    expect(values[`${vendor}:${day(3)}:usd:subscription`]).toEqual(usd(4000));
    expect(values[`${vendor}:${day(3)}:usd:one_time`]).toEqual(usd(998));
    expect(values[`${vendor}:${day(10)}:eur:subscription`]).toEqual(eur(4000));
    expect(kinds[`${vendor}:${day(3)}:usd:one_time`]).toBe("one_time");
  }, 30_000);

  it("reads Google Play sales as daily totals per kind, less refunds", async () => {
    const { complete, values } = await recent("googleplay", googlePlayKey(GOOGLE_PLAY.one), {
      livemode: true,
    });
    expect(complete).toBe(true);
    const day = (back: number) =>
      new Date(Date.now() - back * DAY * 1000).toISOString().slice(0, 10);
    expect(values[`${day(5)}:subscription:usd`]).toEqual(usd(2000));
    expect(values[`${day(10)}:subscription:usd`]).toEqual(usd(0));
    expect(values[`${day(6)}:one_time:usd`]).toEqual(usd(500));
    expect(values[`${day(12)}:one_time:usd`]).toEqual(usd(600));
  }, 20_000);

  it("reads Zoho Billing payments less refunds, of unknown kind", async () => {
    const { complete, values, kinds } = await recent("zoho", ZOHO.keys.one, { livemode: true });
    expect(complete).toBe(true);
    const id = (payment: string) => `${ZOHO.organization}:${payment}`;
    expect(values).toMatchObject({
      [id("pay_recent")]: usd(2900),
      [id("pay_eur")]: eur(1000),
      [id("pay_partial")]: usd(3000),
      [id("pay_refunded")]: usd(0),
      [id("pay_yearly")]: usd(24000),
    });
    expect(values).not.toHaveProperty(id("pay_failed"));
    expect(kinds[id("pay_recent")]).toBe("unknown");
  }, 30_000);

  it("reads AbacatePay's revenue as one payment a day", async () => {
    const { complete, values, kinds } = await recent("abacatepay", ABACATEPAY.one, {
      livemode: true,
    });
    expect(complete).toBe(true);
    const day = (back: number) =>
      new Date(Date.now() - back * DAY * 1000).toISOString().slice(0, 10);
    expect(values[`store_harborfixture:${day(10)}`]).toEqual({ currency: "brl", amount: 50_000 });
    expect(values[`store_harborfixture:${day(3)}`]).toEqual({ currency: "brl", amount: 12_000 });
    expect(kinds[`store_harborfixture:${day(3)}`]).toBe("unknown");
  }, 20_000);
});

describe("Gumroad", () => {
  it("connects through OAuth with a code that only the PKCE verifier redeems", async () => {
    const flow = newGumroadFlow("saas-1", "user-1");
    const approve = async () => {
      const response = await fetch(gumroadAuthorizeUrl(GUMROAD.clientId, flow), {
        redirect: "manual",
      });
      const back = new URL(response.headers.get("location")!);
      expect(back.pathname).toBe("/api/gumroad/callback");
      expect(back.searchParams.get("state")).toBe(flow.state);
      return back.searchParams.get("code")!;
    };
    const app = { id: GUMROAD.clientId, secret: "secret" };
    await expect(exchangeGumroadCode(app, await approve(), "wrong-verifier")).rejects.toThrow(
      "Gumroad did not complete the connection. Try again.",
    );
    expect(await exchangeGumroadCode(app, await approve(), flow.verifier)).toEqual({
      token: GUMROAD.tokens.one,
      hint: `…${GUMROAD.tokens.one.slice(-4)}`,
    });
  });

  it("reads MRR from memberships and their latest charges, with history", async () => {
    const result = await verifyRevenue("gumroad", GUMROAD.tokens.one, true);
    expect(result).toMatchObject({
      provider: "gumroad",
      livemode: true,
      mrrCents: 5000,
      customers: 3,
      skippedItems: 1,
      historyNote: null,
    });
    expect(result.history).toHaveLength(12);
    const light = await verifyRevenue("gumroad", GUMROAD.tokens.one, true, new Date(), {
      history: false,
    });
    expect(light).toMatchObject({ mrrCents: 5000, customers: 3, history: null });
  });

  it("refuses a token that can do more than read sales", async () => {
    await expect(verifyRevenue("gumroad", GUMROAD.tokens.wide, true)).rejects.toThrow(
      "The Gumroad connection can do more than read sales, or cannot read them. Connect Gumroad again.",
    );
  });

  it("never takes a pasted token", () => {
    expect(() =>
      adapter("gumroad").parseKey({ key: GUMROAD.tokens.one, account: "" }, { allowTest: true }),
    ).toThrow("Connect Gumroad with the Connect with Gumroad button.");
  });

  it("reads revenue from the daily sales summary", async () => {
    const read = await adapter("gumroad").payments(GUMROAD.tokens.one, true, {
      allowTest: true,
      since: 0,
      before: null,
      maxPages: 200,
      stored: () => null,
    });
    expect(read.complete).toBe(true);
    expect(read.payments.every((payment) => payment.id.startsWith(`${GUMROAD.user}:`))).toBe(true);
    expect(read.payments.reduce((sum, payment) => sum + payment.value!.amount, 0)).toBe(59_200);
  });
});
