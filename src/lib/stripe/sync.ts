import "server-only";
import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { fetchPaidInvoices, fetchStripeAccountData, StripeRequestError } from "./client";
import { decryptStripeKey, encryptStripeKey } from "./crypto";
import { makerMessage, VerificationError } from "./errors";
import { usdRates } from "./fx";
import { historyWindowStart, monthEnds, mrrAt, serviceLines } from "./history";
import { calculateMrr, toUsdCents } from "./mrr";
import type { RestrictedKey } from "./key";

export type Verification = {
  mrrCents: number;
  customers: number;
  currencies: Record<string, number>;
  fxDate: string | null;
  subscriptionHashes: string[];
  skippedItems: number;
  /** MRR at the last twelve month-ends, from paid invoices; null without invoice access. */
  history: { month: string; mrr_cents: number }[] | null;
  /** Invoice-based MRR now and 30 days ago, the basis for 30-day growth. */
  mrrInvoiceCents: number | null;
  mrr30dAgoCents: number | null;
  historyNote: string | null;
};

const DAY = 86_400;

// History is extra. MRR verifies without it when the key cannot read invoices or prices, or when
// the account has more invoices than one run reads; the maker gets a note saying which.
async function invoiceHistory(key: string, now: Date) {
  try {
    const { invoices, prices } = await fetchPaidInvoices(key, historyWindowStart(now));
    return { lines: serviceLines(invoices, prices), note: null };
  } catch (error) {
    if (error instanceof StripeRequestError && error.status === 403)
      return {
        lines: null,
        note: `Revenue history needs the ${error.path?.startsWith("/v1/prices") ? "Prices" : "Invoices"}: Read permission on the restricted key.`,
      };
    if (error instanceof StripeRequestError && error.tooMuchData)
      return {
        lines: null,
        note: "The Stripe account has more invoices than one verification reads, so there is no revenue history.",
      };
    throw error;
  }
}

// Reads the Stripe account and computes verified MRR in USD cents. Makes no writes anywhere.
export async function verifyStripeRevenue(key: string, now = new Date()): Promise<Verification> {
  const { subscriptions, coupons } = await fetchStripeAccountData(key);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const mrr = calculateMrr(subscriptions, coupons, nowSeconds);
  const { lines, note } = await invoiceHistory(key, now);
  const points = lines
    ? {
        months: monthEnds(now).map(({ month, at }) => ({ month, byCurrency: mrrAt(lines, at) })),
        now: mrrAt(lines, nowSeconds),
        before: mrrAt(lines, nowSeconds - 30 * DAY),
      }
    : null;
  // History is converted at today's rates, so the chart shows business growth, not FX moves.
  const currenciesUsed = new Set(Object.keys(mrr.byCurrency));
  for (const map of points
    ? [points.now, points.before, ...points.months.map((m) => m.byCurrency)]
    : [])
    for (const currency of Object.keys(map)) currenciesUsed.add(currency);
  const { rates, date } = await usdRates([...currenciesUsed]);
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
    history: points
      ? points.months.map(({ month, byCurrency }) => ({
          month,
          mrr_cents: toUsdCents(byCurrency, rates),
        }))
      : null,
    mrrInvoiceCents: points ? toUsdCents(points.now, rates) : null,
    mrr30dAgoCents: points ? toUsdCents(points.before, rates) : null,
    historyNote: note,
  };
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
    p_history: verification.history,
    p_mrr_invoice_cents: verification.mrrInvoiceCents,
    p_mrr_30d_ago_cents: verification.mrr30dAgoCents,
  });
  if (error?.message.includes("already verify another SaaS"))
    throw new VerificationError(
      "This Stripe account already verifies another SaaS on The SaaS Harbor.",
    );
  if (error) throw new Error(`The verification could not be recorded: ${error.message}`);
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
  if (error) throw new VerificationError("The Stripe connection could not be loaded.");
  if (!connection) throw new VerificationError("Stripe is not connected.");
  try {
    const key = decryptStripeKey(connection.encrypted_key, saasId);
    const verification = await verifyStripeRevenue(key);
    await record(saasId, verification, connection.livemode);
    return verification;
  } catch (cause) {
    const message = makerMessage(cause).slice(0, 500);
    await admin
      .from("stripe_connections")
      .update({ status: "error", last_error: message })
      .eq("saas_id", saasId);
    throw new VerificationError(message, { cause });
  }
}

export async function disconnectStripe(saasId: string) {
  const { error } = await adminClient().from("stripe_connections").delete().eq("saas_id", saasId);
  if (error) throw new VerificationError("Stripe could not be disconnected. Please try again.");
}

// Scheduled refresh of every connection, a few at a time.
export async function syncAllStripeConnections() {
  // The API returns at most 1,000 rows per request, so connections are read a page at a time.
  const queue: string[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await adminClient()
      .from("stripe_connections")
      .select("saas_id")
      .order("saas_id")
      .range(start, start + 999);
    if (error) throw new Error("Stripe connections could not be loaded.");
    queue.push(...data.map((row) => row.saas_id));
    if (data.length < 1000) break;
  }
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
