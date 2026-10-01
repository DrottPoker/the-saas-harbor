import "server-only";
import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { providerName, type ProviderId } from "./catalog";
import {
  changedDuringCheck,
  DISCONNECTED_DURING_CHECK,
  REPLACED_DURING_CHECK,
  VerificationError,
} from "./errors";
import { usdRates } from "./fx";
import { MAX_PAGES } from "./http";
import { toUsdCents } from "./money";
import {
  collectPayments,
  dayOf,
  dayStart,
  rereadFrom,
  revenueHistory,
  revenueMonths,
  revenueWindows,
  type MonthTotals,
  type RevenueMonth,
} from "./payments";
import { adapter } from "./providers";
import type { ListedPayment, PaymentKind, StoredPayment } from "./types";

/** Revenue in USD cents; a window is null until the stored payments cover it. */
export type RevenueFigures = {
  days30Cents: number | null;
  months12Cents: number | null;
  totalCents: number | null;
  /** Revenue by month over the months the MRR history covers, from the first one covered. */
  history: RevenueMonth[] | null;
  /** When the payments were read. */
  at: string;
};

/**
 * Pages of older payments read per run until the account's first payment is reached. A run lists
 * the last six months first, which may take up to the full page limit.
 */
const OLDER_PAGES = 100;

type ReadState = {
  provider: string;
  connected_at: string;
  from: string | null;
  origin: boolean;
  read_at: string | null;
  unsorted: { from: string; to: string } | null;
  stored: Record<string, [string, number, PaymentKind | null]>;
};

type Totals = Record<"days30" | "months12" | "total", Record<string, number> | null> & {
  months?: { from: string; totals: MonthTotals } | null;
};

/** The SHA-256 a payment is stored and claimed by, so equal ids of two providers never meet. */
export function paymentHash(provider: ProviderId, id: string) {
  return createHash("sha256").update(`payment:${provider}:${id}`).digest("hex");
}

/**
 * Reads a connection's payments and stores them: the last six months listed again, so refunds are
 * picked up and only new or changed payments are valued, then a part of the older ones until the
 * account's first payment, or else the payments of the months charted that have no kind yet.
 * Returns the figures and months the stored payments cover. `connectedAt` names the
 * connection whose key this is: payments are stored only while it is still the one connected.
 */
export async function readRevenue(
  saasId: string,
  provider: ProviderId,
  key: string,
  livemode: boolean,
  {
    allowTest,
    connectedAt,
    now = new Date(),
  }: { allowTest: boolean; connectedAt: string; now?: Date },
): Promise<RevenueFigures> {
  const admin = adminClient();
  const reread = rereadFrom(now);
  const months = revenueMonths(now);
  const { data, error } = await admin.rpc("revenue_read_state", {
    p_saas_id: saasId,
    p_from: reread,
    p_months_from: months.from,
  });
  if (error) throw new Error("The revenue read state could not be loaded.");
  // No connection any more: the founder disconnected the provider since the run began.
  if (!data) throw new VerificationError(DISCONNECTED_DURING_CHECK);
  const state = data as ReadState;
  if (state.provider !== provider)
    throw new VerificationError("The product is connected to another provider.");
  if (Date.parse(state.connected_at) !== Date.parse(connectedAt))
    throw new VerificationError(REPLACED_DURING_CHECK);

  const stored = (id: string): StoredPayment | null => {
    const found = state.stored[paymentHash(provider, id)];
    return found ? { fingerprint: found[0], amount: found[1], kind: found[2] } : null;
  };
  const unchanged = (payment: ListedPayment) =>
    stored(payment.id)?.fingerprint === payment.fingerprint;
  const read = (since: string, before: string | null, maxPages: number) =>
    adapter(provider).payments(key, livemode, {
      allowTest,
      since: dayStart(since),
      before: before === null ? null : dayStart(before),
      maxPages,
      stored,
    });

  const plan = await collectPayments(
    { from: state.from, origin: state.origin, readAt: state.read_at, unsorted: state.unsorted },
    now,
    read,
    { recent: MAX_PAGES, older: OLDER_PAGES },
  );
  if (!plan)
    throw new VerificationError(
      `The ${providerName(provider)} account has more payments on one day than one read covers, so there is no revenue beyond MRR.`,
    );
  const { windows, listed, from, origin } = plan;

  const byHash = new Map<string, ListedPayment>();
  for (const payment of listed) byHash.set(paymentHash(provider, payment.id), payment);
  const changed = [...byHash].flatMap(([hash, payment]) => {
    if (unchanged(payment)) return [];
    if (!payment.value || !payment.kind) throw new Error("A changed payment was left unvalued.");
    return [
      {
        hash,
        day: dayOf(payment.at),
        currency: payment.value.currency.toLowerCase(),
        amount: Math.max(0, Math.round(payment.value.amount)),
        fingerprint: payment.fingerprint,
        kind: payment.kind,
      },
    ];
  });
  // Unchanged payments whose kind the read tells, such as those stored before kinds were read.
  const kinds = [...byHash].flatMap(([hash, payment]) =>
    unchanged(payment) && payment.kind && payment.kind !== stored(payment.id)?.kind
      ? [{ hash, kind: payment.kind }]
      : [],
  );

  const { days30, months12 } = revenueWindows(now);
  const { data: totals, error: recordError } = await admin.rpc("record_revenue_payments", {
    p_saas_id: saasId,
    p_provider: provider,
    p_windows: windows,
    p_listed: [...byHash.keys()],
    p_payments: changed,
    p_from: from,
    p_origin: origin,
    p_days30: days30,
    p_months12: months12,
    p_connected_at: connectedAt,
    p_kinds: kinds,
    p_months_from: months.from,
    p_months_to: months.to,
  });
  const refused = changedDuringCheck(recordError?.message);
  if (refused) throw refused;
  if (recordError?.message.includes("already verify another SaaS"))
    throw new VerificationError(
      `Payments of this ${providerName(provider)} account already verify another SaaS on The SaaS Harbor.`,
    );
  if (recordError || !totals)
    throw new Error(`The payments could not be recorded: ${recordError?.message}`);

  const { months: byMonth, ...figures } = totals as Totals;
  const currencies = new Set(
    [
      ...Object.values(figures),
      ...Object.values(byMonth?.totals ?? {}).flatMap((kinds) => Object.values(kinds)),
    ].flatMap((byCurrency) => Object.keys(byCurrency ?? {})),
  );
  const { rates } = await usdRates([...currencies]);
  const usd = (byCurrency: Record<string, number> | null) =>
    byCurrency ? toUsdCents(byCurrency, rates) : null;
  return {
    days30Cents: usd(figures.days30),
    months12Cents: usd(figures.months12),
    totalCents: usd(figures.total),
    history: byMonth ? revenueHistory(months.months, byMonth.from, byMonth.totals, rates) : null,
    at: now.toISOString(),
  };
}
