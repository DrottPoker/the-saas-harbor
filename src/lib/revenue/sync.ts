import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { providerName, type ProviderId } from "./catalog";
import { decryptProviderKey, encryptProviderKey } from "./crypto";
import { makerMessage, REPLACED_DURING_CHECK, VerificationError } from "./errors";
import { usdRates } from "./fx";
import { monthEnds, mrrAt } from "./history";
import { toUsdCents } from "./money";
import { adapter } from "./providers";
import { readRevenue, type RevenueFigures } from "./revenue";
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
  /** What else MRR could not take into account, such as subscriptions with a deleted coupon. */
  mrrNote: string | null;
  /** When the history was read, which a later verification may carry over; null when it was not. */
  historyAt: string | null;
  /** Revenue from payments, read about once a day and carried over in between. */
  revenue: RevenueFigures | null;
};

const DAY = 86_400;
/** Hourly verifications carry over a history read less than this long ago. */
const HISTORY_MAX_AGE_MS = 23 * 3_600_000;
/** Revenue figures are carried over while the payments behind them are this recent. */
const REVENUE_MAX_AGE_MS = 48 * 3_600_000;
/** A founder's refresh reads payments again once this long has passed since the last read. */
const REVENUE_REFRESH_MS = 3_600_000;
/** A connection is verified again once this long has passed since its last check. */
const SYNC_INTERVAL = "55 minutes";

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
// Without `history`, only what MRR needs is read, and the history fields are empty.
export async function verifyRevenue(
  provider: ProviderId,
  key: string,
  livemode: boolean | null,
  now = new Date(),
  { history = true }: { history?: boolean } = {},
): Promise<Verification> {
  const reading = await adapter(provider).read(key, livemode, {
    allowTest: allowTestKeys(),
    now,
    history,
  });
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
    mrrNote: reading.mrrNote ?? null,
    historyAt: history ? now.toISOString() : null,
    revenue: null,
  };
}

// Stores a verification: with a new key, or for the connection read (`connectedAt`), which the
// database checks is still the one connected, so a run that read a key replaced since stores
// nothing.
async function record(
  saasId: string,
  verification: Verification,
  { newKey, connectedAt }: { newKey?: { encrypted: string; hint: string }; connectedAt?: string },
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
    p_history_at: verification.historyAt,
    p_revenue_30d_cents: verification.revenue?.days30Cents ?? null,
    p_revenue_12m_cents: verification.revenue?.months12Cents ?? null,
    p_revenue_total_cents: verification.revenue?.totalCents ?? null,
    p_revenue_at: verification.revenue?.at ?? null,
    p_connected_at: connectedAt ?? null,
  });
  if (error?.message.includes("connection changed"))
    throw new VerificationError(REPLACED_DURING_CHECK);
  if (error?.message.includes("already verify another SaaS"))
    throw new VerificationError(
      `This ${providerName(verification.provider)} account already verifies another SaaS on The SaaS Harbor.`,
    );
  if (error) throw new Error(`The verification could not be recorded: ${error.message}`);
}

// Connects a new or replacement key. The key is verified before anything is stored. Its payments
// are read once the founder has the answer, marked checked first so a scheduled run skips them.
export async function connectProvider(saasId: string, provider: ProviderId, key: ParsedKey) {
  const verification = await verifyRevenue(provider, key.key, key.livemode);
  await record(saasId, verification, {
    newKey: { encrypted: encryptProviderKey(key.key, saasId), hint: key.hint },
  });
  after(async () => {
    try {
      await adminClient()
        .from("revenue_connections")
        .update({ revenue_checked_at: new Date().toISOString() })
        .eq("saas_id", saasId);
      await syncConnection(saasId, { scheduled: true, revenue: true });
    } catch {
      // Recorded on the connection; the scheduled run tries again.
    }
  });
  return verification;
}

type LatestSnapshot = {
  provider: string;
  history: unknown;
  mrr_invoice_cents: number | null;
  mrr_30d_ago_cents: number | null;
  history_at: string | null;
  revenue_30d_cents?: number | null;
  revenue_12m_cents?: number | null;
  revenue_total_cents?: number | null;
  revenue_at?: string | null;
};

/**
 * The history a scheduled verification carries over from the latest snapshot: one read from the
 * same provider less than a day ago, or null to read it again. The history reads far more of an
 * account than MRR does.
 */
export function historyToCarry(latest: LatestSnapshot | null, provider: string, now = Date.now()) {
  if (!latest?.history_at || latest.provider !== provider) return null;
  if (now - Date.parse(latest.history_at) >= HISTORY_MAX_AGE_MS) return null;
  return {
    history: latest.history as Verification["history"],
    mrrInvoiceCents: latest.mrr_invoice_cents,
    mrr30dAgoCents: latest.mrr_30d_ago_cents,
    historyAt: latest.history_at,
  };
}

/**
 * The revenue figures a verification that reads no payments carries over from the latest
 * snapshot: ones read from the same provider less than two days ago, or null.
 */
export function revenueToCarry(
  latest: LatestSnapshot | null,
  provider: string,
  now = Date.now(),
): RevenueFigures | null {
  if (!latest?.revenue_at || latest.provider !== provider) return null;
  if (now - Date.parse(latest.revenue_at) >= REVENUE_MAX_AGE_MS) return null;
  return {
    days30Cents: latest.revenue_30d_cents ?? null,
    months12Cents: latest.revenue_12m_cents ?? null,
    totalCents: latest.revenue_total_cents ?? null,
    at: latest.revenue_at,
  };
}

async function latestSnapshot(saasId: string) {
  const { data, error } = await adminClient()
    .from("revenue_snapshots")
    .select(
      "provider, history, mrr_invoice_cents, mrr_30d_ago_cents, history_at, revenue_30d_cents, revenue_12m_cents, revenue_total_cents, revenue_at",
    )
    .eq("saas_id", saasId)
    .order("captured_at", { ascending: false })
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("The latest snapshot could not be loaded.");
  return data;
}

/** Whether a founder's refresh reads payments too: when they were not read in the last hour. */
export function refreshReadsPayments(checkedAt: string | null, now = Date.now()) {
  return !checkedAt || now - Date.parse(checkedAt) >= REVENUE_REFRESH_MS;
}

// Re-verifies a stored connection. A scheduled run carries over a history read less than a day
// ago; a maker's refresh reads everything. Payments are read when a scheduled run says they are
// due, or on a maker's refresh when they were not read in the last hour; otherwise the latest
// figures are carried over. Failures are recorded on the connection for the owner; a failed read
// of payments leaves MRR verified.
export async function syncConnection(
  saasId: string,
  { scheduled = false, revenue = false }: { scheduled?: boolean; revenue?: boolean } = {},
) {
  const admin = adminClient();
  const { data: connection, error } = await admin
    .from("revenue_connections")
    .select("provider, encrypted_key, livemode, revenue_checked_at, connected_at")
    .eq("saas_id", saasId)
    .maybeSingle();
  if (error) throw new VerificationError("The connection could not be loaded.");
  if (!connection) throw new VerificationError("No payment provider is connected.");
  const readPayments = scheduled ? revenue : refreshReadsPayments(connection.revenue_checked_at);
  // A scheduled run marked the payments checked when it claimed them; a refresh does so here.
  if (readPayments && !scheduled)
    await admin
      .from("revenue_connections")
      .update({ revenue_checked_at: new Date().toISOString() })
      .eq("saas_id", saasId);
  try {
    const key = decryptProviderKey(connection.encrypted_key, saasId);
    const provider = connection.provider as ProviderId;
    const latest = await latestSnapshot(saasId);
    const carried = scheduled ? historyToCarry(latest, provider) : null;
    const read = await verifyRevenue(provider, key, connection.livemode, new Date(), {
      history: !carried,
    });
    const verification = carried ? { ...read, ...carried } : read;
    verification.revenue = revenueToCarry(latest, provider);
    if (readPayments)
      try {
        verification.revenue = await readRevenue(saasId, provider, key, connection.livemode, {
          allowTest: allowTestKeys(),
          connectedAt: connection.connected_at,
        });
      } catch (cause) {
        await admin
          .from("revenue_connections")
          .update({ revenue_note: makerMessage(cause).slice(0, 500) })
          .eq("saas_id", saasId)
          .eq("connected_at", connection.connected_at);
      }
    await record(saasId, verification, { connectedAt: connection.connected_at });
    return verification;
  } catch (cause) {
    // A failure is recorded on the connection that was read, not on a key connected since.
    const message = makerMessage(cause).slice(0, 500);
    await admin
      .from("revenue_connections")
      .update({ status: "error", last_error: message })
      .eq("saas_id", saasId)
      .eq("connected_at", connection.connected_at);
    throw new VerificationError(message, { cause });
  }
}

export async function disconnectProvider(saasId: string) {
  const { error } = await adminClient().from("revenue_connections").delete().eq("saas_id", saasId);
  if (error)
    throw new VerificationError("The provider could not be disconnected. Please try again.");
}

// The scheduled run: verifies the connections that are due, oldest first, three at a time, and
// stops claiming more once `budgetMs` has passed. Each connection is due about every hour, so a
// scheduler that calls this every few minutes spreads the work out.
export async function syncDueConnections({ budgetMs = 240_000 } = {}) {
  const started = Date.now();
  let ok = 0;
  let failed = 0;
  const claim = async () => {
    const { data, error } = await adminClient().rpc("claim_due_verifications", {
      p_limit: 1,
      p_interval: SYNC_INTERVAL,
    });
    if (error) throw new Error("Due revenue connections could not be claimed.");
    return data[0] ?? null;
  };
  const worker = async () => {
    while (Date.now() - started < budgetMs) {
      const due = await claim();
      if (!due) return;
      try {
        await syncConnection(due.saas_id, { scheduled: true, revenue: due.revenue_due });
        ok++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  const { count } = await adminClient()
    .from("revenue_connections")
    .select("saas_id", { count: "exact", head: true })
    .or(
      `last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - 55 * 60_000).toISOString()}`,
    )
    .or(
      `last_synced_at.is.null,last_synced_at.lt.${new Date(Date.now() - 55 * 60_000).toISOString()}`,
    );
  return { ok, failed, due: count ?? 0 };
}
