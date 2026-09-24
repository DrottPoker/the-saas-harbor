import "server-only";
import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { fetchStripeAccountData } from "./client";
import { decryptStripeKey, encryptStripeKey } from "./crypto";
import { usdRates } from "./fx";
import { calculateMrr, toUsdCents } from "./mrr";
import type { RestrictedKey } from "./key";

export type Verification = {
  mrrCents: number;
  customers: number;
  currencies: Record<string, number>;
  fxDate: string | null;
  subscriptionHashes: string[];
  skippedItems: number;
};

// Reads the Stripe account and computes verified MRR in USD cents. Makes no writes anywhere.
export async function verifyStripeRevenue(key: string): Promise<Verification> {
  const { subscriptions, coupons } = await fetchStripeAccountData(key);
  const mrr = calculateMrr(subscriptions, coupons);
  const { rates, date } = await usdRates(Object.keys(mrr.byCurrency));
  const currencies = Object.fromEntries(
    Object.entries(mrr.byCurrency).map(([currency, minor]) => [currency, Math.round(minor)]),
  );
  return {
    mrrCents: toUsdCents(mrr.byCurrency, rates),
    customers: mrr.customers,
    currencies,
    fxDate: date,
    subscriptionHashes: mrr.subscriptionIds.map((id) =>
      createHash("sha256").update(id).digest("hex"),
    ),
    skippedItems: mrr.skippedItems,
  };
}

function friendly(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("already verify another SaaS"))
    return "This Stripe account already verifies another SaaS on The SaaS Harbor.";
  return message || "Verification failed. Try again shortly.";
}

async function record(
  saasId: string,
  verification: Verification,
  livemode: boolean,
  newKey?: { encrypted: string; hint: string },
) {
  const { error } = await adminClient().rpc("record_stripe_verification", {
    p_saas_id: saasId,
    p_encrypted_key: newKey?.encrypted ?? null,
    p_key_hint: newKey?.hint ?? null,
    p_livemode: livemode,
    p_mrr_cents: verification.mrrCents,
    p_customers: verification.customers,
    p_currencies: verification.currencies,
    p_fx_date: verification.fxDate,
    p_subscription_hashes: verification.subscriptionHashes,
  });
  if (error) throw new Error(friendly(new Error(error.message)));
}

// Connects a new or replacement key. The key is verified before anything is stored.
export async function connectStripe(saasId: string, key: RestrictedKey) {
  const verification = await verifyStripeRevenue(key.key);
  await record(saasId, verification, key.livemode, {
    encrypted: encryptStripeKey(key.key, saasId),
    hint: key.hint,
  });
  return verification;
}

// Re-verifies a stored connection. Failures are recorded on the connection for the owner.
export async function syncStripeConnection(saasId: string) {
  const admin = adminClient();
  const { data: connection, error } = await admin
    .from("stripe_connections")
    .select("encrypted_key, livemode")
    .eq("saas_id", saasId)
    .maybeSingle();
  if (error) throw new Error("The Stripe connection could not be loaded.");
  if (!connection) throw new Error("Stripe is not connected.");
  try {
    const key = decryptStripeKey(connection.encrypted_key, saasId);
    const verification = await verifyStripeRevenue(key);
    await record(saasId, verification, connection.livemode);
    return verification;
  } catch (cause) {
    const message = friendly(cause).slice(0, 500);
    await admin
      .from("stripe_connections")
      .update({ status: "error", last_error: message })
      .eq("saas_id", saasId);
    throw new Error(message, { cause });
  }
}

export async function disconnectStripe(saasId: string) {
  const { error } = await adminClient().from("stripe_connections").delete().eq("saas_id", saasId);
  if (error) throw new Error("Stripe could not be disconnected. Please try again.");
}

// Scheduled refresh of every connection, a few at a time.
export async function syncAllStripeConnections() {
  const { data, error } = await adminClient().from("stripe_connections").select("saas_id");
  if (error) throw new Error("Stripe connections could not be loaded.");
  const queue = (data ?? []).map((row) => row.saas_id);
  let ok = 0;
  let failed = 0;
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        await syncStripeConnection(id);
        ok++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  return { ok, failed };
}
