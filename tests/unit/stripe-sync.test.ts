// Runs the full read path (Stripe client, MRR, invoice history, FX) against the fake Stripe server
// that the browser tests use.
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyStripeRevenue } from "../../src/lib/stripe/sync";

const PORT = 3912;
const base = `http://127.0.0.1:${PORT}`;
let server: ChildProcess;
const healthy = () =>
  fetch(`${base}/health`).then(
    (r) => r.ok,
    () => false,
  );

beforeAll(async () => {
  server = spawn(process.execPath, ["tests/e2e/fake-stripe.mjs"], {
    env: { ...process.env, FAKE_STRIPE_PORT: String(PORT) },
    stdio: "ignore",
  });
  process.env.STRIPE_API_BASE = base;
  process.env.FX_API_BASE = base;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await healthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The fake Stripe server did not start.");
});

afterAll(() => {
  server?.kill();
});

describe("Stripe verification", () => {
  it("reads MRR and twelve months of invoice history", async () => {
    const result = await verifyStripeRevenue("rk_test_harborfixture0001");
    expect(result).toMatchObject({
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
    const months = result.history!.map((point) => point.month);
    expect([...months].sort()).toEqual(months);
  });

  it("still verifies MRR when the key cannot read invoices", async () => {
    const result = await verifyStripeRevenue("rk_test_harborfixture0002");
    expect(result.mrrCents).toBe(2_900);
    expect(result.history).toBeNull();
    expect(result.mrrInvoiceCents).toBeNull();
    expect(result.historyNote).toMatch(/Invoices: Read/);
  });
  it("values a multi-currency price in the currency the subscription pays", async () => {
    const result = await verifyStripeRevenue("rk_test_harborfixture0003");
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
