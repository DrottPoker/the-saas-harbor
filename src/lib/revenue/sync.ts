import "server-only";
import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { providerName, type ProviderId } from "./catalog";
import { decryptProviderKey, encryptProviderKey } from "./crypto";
import { makerMessage, VerificationError } from "./errors";
import { usdRates } from "./fx";
import { monthEnds, mrrAt } from "./history";
import { toUsdCents } from "./money";
import { adapter } from "./providers";
import type { ParsedKey } from "./types";

export type Verification = {
  provider: ProviderId;
  livemode: boolean;
  mrrCents: number;
  customers: number;
  currencies: Record<string, number>;
  fxDate: string | null;
  subscriptionHashes: string[];
  skippedItems: number;
  /** MRR at the last twelve month-ends, from paid charges; null when there are none to read. */
  history: { month: string; mrr_cents: number }[] | null;
  /** MRR from paid charges now and 30 days ago, the basis for 30-day growth. */
  mrrInvoiceCents: number | null;
  mrr30dAgoCents: number | null;
  historyNote: string | null;
};

const DAY = 86_400;

/** Test keys and sandboxes are accepted only where the server allows them, never in production. */
export function allowTestKeys() {
  return process.env.REVENUE_ALLOW_TEST_KEYS === "true";
}

// A claim is the SHA-256 of a subscription id. Stripe's ids are hashed as they are, as before
// other providers were supported; other ids carry their provider's name.
function claimHash(provider: ProviderId, id: string) {
  return createHash("sha256")
    .update(provider === "stripe" ? id : `${provider}:${id}`)
    .digest("hex");
}

// Reads the provider account and computes verified MRR in USD cents. Makes no writes anywhere.
export async function verifyRevenue(
  provider: ProviderId,
  key: string,
  livemode: boolean | null,
  now = new Date(),
): Promise<Verification> {
  const reading = await adapter(provider).read(key, livemode, { allowTest: allowTestKeys(), now });
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const lines = reading.lines;
  const points = lines
    ? {
        months: monthEnds(now).map(({ month, at }) => ({ month, byCurrency: mrrAt(lines, at) })),
        now: mrrAt(lines, nowSeconds),
        before: mrrAt(lines, nowSeconds - 30 * DAY),
      }
    : null;
  // History is converted at today's rates, so the chart shows business growth, not FX moves.
  const currenciesUsed = new Set(Object.keys(reading.byCurrency));
  for (const map of points
    ? [points.now, points.before, ...points.months.map((m) => m.byCurrency)]
    : [])
    for (const currency of Object.keys(map)) currenciesUsed.add(currency);
  const { rates, date } = await usdRates([...currenciesUsed]);
  const currencies = Object.fromEntries(
    Object.entries(reading.byCurrency).map(([currency, minor]) => [currency, Math.round(minor)]),
  );
  return {
    provider,
    livemode: reading.livemode,
    mrrCents: toUsdCents(reading.byCurrency, rates),
    customers: reading.customers,
    currencies,
    fxDate: date,
    subscriptionHashes: reading.subscriptionIds.map((id) => claimHash(provider, id)),
    skippedItems: reading.skippedItems,
    history: points
      ? points.months.map(({ month, byCurrency }) => ({
          month,
          mrr_cents: toUsdCents(byCurrency, rates),
        }))
      : null,
    mrrInvoiceCents: points ? toUsdCents(points.now, rates) : null,
    mrr30dAgoCents: points ? toUsdCents(points.before, rates) : null,
    historyNote: reading.historyNote,
  };
}

async function record(
  saasId: string,
  verification: Verification,
  newKey?: { encrypted: string; hint: string },
) {
  const { error } = await adminClient().rpc("record_revenue_verification", {
    p_saas_id: saasId,
    p_provider: verification.provider,
    p_encrypted_key: newKey?.encrypted ?? null,
    p_key_hint: newKey?.hint ?? null,
    p_livemode: verification.livemode,
    p_mrr_cents: verification.mrrCents,
    p_customers: verification.customers,
    p_currencies: verification.currencies,
    p_fx_date: verification.fxDate,
    p_subscription_hashes: verification.subscriptionHashes,
    p_history: verification.history,
    p_mrr_invoice_cents: verification.mrrInvoiceCents,
    p_mrr_30d_ago_cents: verification.mrr30dAgoCents,
  });
  if (error?.message.includes("already verify another SaaS"))
    throw new VerificationError(
      `This ${providerName(verification.provider)} account already verifies another SaaS on The SaaS Harbor.`,
    );
  if (error) throw new Error(`The verification could not be recorded: ${error.message}`);
}

// Connects a new or replacement key. The key is verified before anything is stored.
export async function connectProvider(saasId: string, provider: ProviderId, key: ParsedKey) {
  const verification = await verifyRevenue(provider, key.key, key.livemode);
  await record(saasId, verification, {
    encrypted: encryptProviderKey(key.key, saasId),
    hint: key.hint,
  });
  return verification;
}

// Re-verifies a stored connection. Failures are recorded on the connection for the owner.
export async function syncConnection(saasId: string) {
  const admin = adminClient();
  const { data: connection, error } = await admin
    .from("revenue_connections")
    .select("provider, encrypted_key, livemode")
    .eq("saas_id", saasId)
    .maybeSingle();
  if (error) throw new VerificationError("The connection could not be loaded.");
  if (!connection) throw new VerificationError("No payment provider is connected.");
  try {
    const key = decryptProviderKey(connection.encrypted_key, saasId);
    const verification = await verifyRevenue(
      connection.provider as ProviderId,
      key,
      connection.livemode,
    );
    await record(saasId, verification);
    return verification;
  } catch (cause) {
    const message = makerMessage(cause).slice(0, 500);
    await admin
      .from("revenue_connections")
      .update({ status: "error", last_error: message })
      .eq("saas_id", saasId);
    throw new VerificationError(message, { cause });
  }
}

export async function disconnectProvider(saasId: string) {
  const { error } = await adminClient().from("revenue_connections").delete().eq("saas_id", saasId);
  if (error)
    throw new VerificationError("The provider could not be disconnected. Please try again.");
}

// Scheduled refresh of every connection, a few at a time.
export async function syncAllConnections() {
  // The API returns at most 1,000 rows per request, so connections are read a page at a time.
  const queue: string[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await adminClient()
      .from("revenue_connections")
      .select("saas_id")
      .order("saas_id")
      .range(start, start + 999);
    if (error) throw new Error("Revenue connections could not be loaded.");
    queue.push(...data.map((row) => row.saas_id));
    if (data.length < 1000) break;
  }
  let ok = 0;
  let failed = 0;
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        await syncConnection(id);
        ok++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  return { ok, failed };
}
