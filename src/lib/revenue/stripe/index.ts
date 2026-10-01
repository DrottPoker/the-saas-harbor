import "server-only";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import { VerificationError } from "../errors";
import type { ProviderAdapter } from "../types";
import {
  fetchCharges,
  fetchCheckoutSessions,
  fetchDisputes,
  fetchInvoicePayments,
  fetchPaidInvoices,
  fetchStripeAccountData,
} from "./client";
import { serviceLines } from "./history";
import { parseRestrictedKey } from "./key";
import { calculateMrr } from "./mrr";
import {
  chargePayments,
  isPaid,
  knownShares,
  lostByCharge,
  sharesOf,
  untaxedShares,
  type StripeCharge,
  type StripeDispute,
} from "./payments";

const DAY = 86_400;
/** An invoice is created before the charge that pays it, by up to the retries of a failed payment. */
const INVOICE_LEAD = 35 * DAY;
/** A Checkout Session is paid within a day of being created. */
const SESSION_LEAD = 2 * DAY;
/** Charges whose invoices and sessions are read in one go, so the lists stay within a run. */
const SHARE_BATCH = 2000;

// The read permission each list needs, by the start of its path.
const PERMISSIONS: [string, string][] = [
  ["/v1/charges", "Charges"],
  ["/v1/disputes", "Disputes"],
  ["/v1/checkout/sessions", "Checkout Sessions"],
  ["/v1/invoices", "Invoices"],
];

/** A missing permission named for the maker; other failures as they are. */
function permissionError(error: unknown) {
  if (!(error instanceof ProviderRequestError && error.status === 403)) return error;
  const name = PERMISSIONS.find(([path]) => error.path?.startsWith(path))?.[1];
  return name
    ? new VerificationError(
        `Revenue beyond MRR needs the ${name}: Read permission on the restricted key.`,
      )
    : error;
}

/** The untaxed share of each charge that needs one, from its invoice or Checkout Session. */
async function shares(key: string, needed: StripeCharge[]) {
  const found = new Map<string, number>();
  const sorted = [...needed].sort((a, b) => a.created - b.created);
  for (let start = 0; start < sorted.length; start += SHARE_BATCH) {
    const batch = sorted.slice(start, start + SHARE_BATCH);
    const first = batch[0].created;
    const last = batch.at(-1)!.created + 1;
    const invoices = await fetchInvoicePayments(key, first - INVOICE_LEAD, last);
    const sessions = await fetchCheckoutSessions(key, first - SESSION_LEAD, last);
    for (const [id, share] of sharesOf(batch, untaxedShares(invoices, sessions)))
      found.set(id, share);
  }
  return found;
}

// History is extra. MRR verifies without it when the key cannot read invoices or prices, or when
// the account has more invoices than one run reads; the maker gets a note saying which.
async function invoiceHistory(key: string, now: Date) {
  try {
    const { invoices, prices } = await fetchPaidInvoices(key, historyWindowStart(now));
    return { lines: serviceLines(invoices, prices), note: null };
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 403)
      return {
        lines: null,
        note: `Revenue history needs the ${error.path?.startsWith("/v1/prices") ? "Prices" : "Invoices"}: Read permission on the restricted key.`,
      };
    if (error instanceof ProviderRequestError && error.tooMuchData)
      return {
        lines: null,
        note: "The Stripe account has more invoices than one verification reads, so there is no revenue history.",
      };
    throw error;
  }
}

/** What MRR left out or could not take tax out of, in words for the founder, or null. */
export function mrrNote(deletedCoupons: number, taxIncluded: number) {
  const notes: string[] = [];
  if (deletedCoupons === 1)
    notes.push(
      "1 subscription has a coupon that was deleted in Stripe and can no longer be read, so it was not counted.",
    );
  else if (deletedCoupons)
    notes.push(
      `${deletedCoupons} subscriptions have coupons that were deleted in Stripe and can no longer be read, so they were not counted.`,
    );
  if (taxIncluded === 1)
    notes.push(
      "1 subscription's price includes tax that could not be taken out, since its latest invoice could not be read.",
    );
  else if (taxIncluded)
    notes.push(
      `${taxIncluded} subscriptions' prices include tax that could not be taken out, since their latest invoices could not be read.`,
    );
  return notes.length ? notes.join(" ") : null;
}

/**
 * Stripe: subscription MRR from a restricted key, history from paid invoices, and revenue from
 * charges.
 */
export const stripe: ProviderAdapter = {
  id: "stripe",
  parseKey: ({ key }, options) => parseRestrictedKey(key, options),
  async read(key, livemode, { now, history }) {
    const { subscriptions, coupons, deleted, untaxed } = await fetchStripeAccountData(key);
    const { deletedCoupons, taxIncluded, ...mrr } = calculateMrr(
      subscriptions,
      coupons,
      Math.floor(now.getTime() / 1000),
      { untaxed, deleted },
    );
    const { lines, note } = history ? await invoiceHistory(key, now) : { lines: null, note: null };
    return {
      livemode: livemode ?? key.startsWith("rk_live_"),
      ...mrr,
      mrrNote: mrrNote(deletedCoupons, taxIncluded),
      lines,
      historyNote: note,
    };
  },
  async payments(key, _livemode, { since, before, maxPages, stored }) {
    try {
      const { items, complete } = await fetchCharges(key, since, before, maxPages);
      const charges = items.filter(isPaid);
      const disputes: StripeDispute[] = [];
      for (const charge of charges)
        if (charge.disputed) disputes.push(...(await fetchDisputes(key, charge.id)));
      const lost = lostByCharge(disputes);
      const known = knownShares(charges, lost, stored);
      const found = known.needed.length ? await shares(key, known.needed) : new Map();
      return {
        payments: chargePayments(charges, lost, new Map([...known.shares, ...found])),
        complete,
      };
    } catch (error) {
      throw permissionError(error);
    }
  },
};
