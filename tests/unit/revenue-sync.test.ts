// Runs the full read path of every provider (client, MRR, history, FX) against the fake provider
// server that the browser tests use.
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DODO_KEYS, PADDLE_KEYS, POLAR_TOKENS } from "../e2e/fake-billing.mjs";
import { verifyRevenue } from "../../src/lib/revenue/sync";

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

describe("claims", () => {
  it("hash Stripe ids as before and prefix other providers", async () => {
    const { createHash } = await import("node:crypto");
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const stripe = await verifyRevenue("stripe", "rk_test_harborfixture0002", false);
    expect(stripe.subscriptionHashes).toContain(hash("sub_fixture_1"));
    const dodo = await verifyRevenue("dodo", DODO_KEYS.one, false);
    expect(dodo.subscriptionHashes).toContain(hash("dodo:sub_dodo_monthly"));
  });
});
