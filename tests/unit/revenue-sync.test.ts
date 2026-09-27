// Runs the full read path of every provider (client, MRR, history, FX) against the fake provider
// server that the browser tests use.
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DODO_KEYS, PADDLE_KEYS, POLAR_TOKENS } from "../e2e/fake-billing.mjs";
import { CHARGEBEE, CREEM_KEYS, REVENUECAT, WHOP_KEYS } from "../e2e/fake-billing-extra.mjs";
import { historyToCarry, verifyRevenue } from "../../src/lib/revenue/sync";

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
