import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptProviderKey, encryptProviderKey } from "../../src/lib/revenue/crypto";
import { VerificationError } from "../../src/lib/revenue/errors";
import type { ProviderReading, ReadOptions } from "../../src/lib/revenue/types";

// The order in which a re-verification writes: what a run cut short, or a read that fails, leaves
// behind. The database and the provider are stand-ins that record every call.
const SAAS = "7b0e1a52-3c1f-4a8e-9d55-0c2f6a1b9e10";
const CONNECTED_AT = "2026-11-01T00:00:00.000Z";

type Call = { name: string; args?: Record<string, unknown> };
const state = {
  calls: [] as Call[],
  connection: null as Record<string, unknown> | null,
  read: null as unknown as (options: ReadOptions) => Promise<ProviderReading>,
  revenue: null as unknown as () => Promise<unknown>,
};

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => {
  const table = (name: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      update: (values: Record<string, unknown>) => {
        state.calls.push({ name: `update ${name}`, args: values });
        return query;
      },
      maybeSingle: async () => ({
        data: name === "revenue_connections" ? state.connection : null,
        error: null,
      }),
      // An awaited update.
      then: (resolve: (result: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    };
    return query;
  };
  return {
    adminClient: () => ({
      from: table,
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.calls.push({ name, args });
        return { data: true, error: null };
      },
    }),
  };
});
vi.mock("../../src/lib/revenue/providers", () => ({
  adapter: () => ({
    read: (_key: string, _live: boolean, options: ReadOptions) => state.read(options),
  }),
}));
vi.mock("../../src/lib/revenue/revenue", () => ({
  readRevenue: async () => {
    state.calls.push({ name: "readRevenue" });
    return state.revenue();
  },
}));

const reading: ProviderReading = {
  livemode: true,
  byCurrency: { usd: 12_300 },
  customers: 3,
  subscriptionIds: ["sub_1"],
  skippedItems: 0,
  lines: null,
  historyNote: null,
};
const figures = {
  days30Cents: 5_000,
  months12Cents: 40_000,
  totalCents: 90_000,
  history: null,
  at: "2026-11-18T10:00:00.000Z",
};
const names = () => state.calls.map((call) => call.name);
const records = () => state.calls.filter((call) => call.name === "record_revenue_verification");

beforeEach(() => {
  vi.stubEnv("STRIPE_KEY_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  state.calls = [];
  state.connection = {
    provider: "stripe",
    encrypted_key: encryptProviderKey("key-1", SAAS),
    livemode: true,
    revenue_checked_at: null,
    connected_at: CONNECTED_AT,
  };
  state.read = async () => reading;
  state.revenue = async () => figures;
});

describe("a re-verification", () => {
  it("stores MRR before the payments are read, and again with their figures", async () => {
    const { syncConnection } = await import("../../src/lib/revenue/sync");
    await syncConnection(SAAS, { scheduled: true, revenue: true });
    expect(names()).toEqual([
      "record_revenue_verification",
      "readRevenue",
      "record_revenue_verification",
    ]);
    const [first, second] = records();
    expect(first.args).toMatchObject({
      p_mrr_cents: 12_300,
      p_revenue_total_cents: null,
      p_connected_at: CONNECTED_AT,
    });
    expect(second.args).toMatchObject({ p_mrr_cents: 12_300, p_revenue_total_cents: 90_000 });
  });

  it("stores MRR once when no payments are due", async () => {
    const { syncConnection } = await import("../../src/lib/revenue/sync");
    await syncConnection(SAAS, { scheduled: true, revenue: false });
    expect(names()).toEqual(["record_revenue_verification"]);
  });

  it("keeps MRR verified when the payments cannot be read, with a note for the founder", async () => {
    state.revenue = async () => {
      throw new VerificationError({ text: "Stripe did not answer." });
    };
    const { syncConnection } = await import("../../src/lib/revenue/sync");
    await expect(syncConnection(SAAS, { scheduled: true, revenue: true })).resolves.toBeDefined();
    expect(names()).toEqual([
      "record_revenue_verification",
      "readRevenue",
      "update revenue_connections",
    ]);
    expect(state.calls[2].args).toEqual({ revenue_note: "Stripe did not answer." });
  });

  it("stores a renewed key the moment the provider issues it, though the read then fails", async () => {
    state.read = async ({ onRenewedKey }) => {
      await onRenewedKey?.("key-2");
      throw new VerificationError({ text: "The provider did not answer." });
    };
    const { syncConnection } = await import("../../src/lib/revenue/sync");
    await expect(syncConnection(SAAS, { scheduled: true })).rejects.toThrow(/did not answer/);
    expect(names()).toEqual(["renew_revenue_key", "update revenue_connections"]);
    const renewal = state.calls[0].args!;
    expect(renewal).toMatchObject({ p_saas_id: SAAS, p_connected_at: CONNECTED_AT });
    expect(decryptProviderKey(renewal.p_encrypted_key as string, SAAS)).toBe("key-2");
    expect(state.calls[1].args).toMatchObject({ status: "error" });
  });

  it("stores a renewed key once, whether the adapter hands it over, returns it, or both", async () => {
    const { syncConnection } = await import("../../src/lib/revenue/sync");
    state.read = async ({ onRenewedKey }) => {
      await onRenewedKey?.("key-2");
      return { ...reading, renewedKey: "key-2" };
    };
    await syncConnection(SAAS, { scheduled: true });
    expect(names()).toEqual(["renew_revenue_key", "record_revenue_verification"]);
    state.calls = [];
    state.read = async () => ({ ...reading, renewedKey: "key-3" });
    await syncConnection(SAAS, { scheduled: true });
    expect(names()).toEqual(["renew_revenue_key", "record_revenue_verification"]);
    expect(decryptProviderKey(state.calls[0].args!.p_encrypted_key as string, SAAS)).toBe("key-3");
  });
});
