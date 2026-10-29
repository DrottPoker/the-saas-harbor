import "server-only";
import { revenueText, VerificationError } from "../errors";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import { addDays, dayOf, dayStart } from "../payments";
import type { ProviderAdapter } from "../types";
import {
  canRead,
  fetchActiveSubscriptions,
  fetchAllSubscriptions,
  fetchChargesDue,
  fetchPaidWindow,
  otherAccessReads,
  WrongEnvironment,
} from "./client";
import { parseAsaasKey } from "./key";
import {
  activeSubscriptions,
  asaasMrr,
  asaasServiceLines,
  coverageStart,
  cycleMonths,
  paidUp,
  type AsaasPayment,
  type AsaasSubscription,
} from "./mrr";
import { asaasPayments } from "./payments";

const DAY = 86_400;

/**
 * Refuses a key that reaches beyond subscriptions and charges, every time it is used. Asaas has no
 * request that shows a key's permissions, and a key created without any gets full access, which
 * reads transfers and customers too. Whether Subscriptions and Charges are Read rather than Read
 * and write cannot be told without writing, so the editor asks for Read.
 */
async function requireNarrowKey(key: string, live: boolean) {
  for (const [path, params] of otherAccessReads())
    if (await canRead(key, live, path, params)) throw new VerificationError("asaas.beyondAccess");
}

/**
 * The environment of the key, checked as above. A key made before Asaas named the environment in
 * its keys is tried on production first, and on the Sandbox where test keys are allowed.
 */
async function environment(key: string, livemode: boolean | null, allowTest: boolean) {
  if (livemode !== null) {
    await requireNarrowKey(key, livemode);
    return livemode;
  }
  try {
    await requireNarrowKey(key, true);
    return true;
  } catch (error) {
    if (!allowTest || !(error instanceof WrongEnvironment)) throw error;
    await requireNarrowKey(key, false);
    return false;
  }
}

/**
 * The charges that show which active subscriptions are paid up: those due since the earliest day a
 * charge can still cover each subscription, nearest first, and further back only while
 * subscriptions on longer cycles are not covered yet.
 */
async function coverageCharges(key: string, live: boolean, active: AsaasSubscription[], now: Date) {
  const reach = new Map<string, string>();
  for (const subscription of active) {
    const months = cycleMonths(subscription.cycle);
    if (months !== null) reach.set(subscription.id, coverageStart(months, now));
  }
  const charges: AsaasPayment[] = [];
  // The last due day of the range read next, below the ones read before it.
  let upTo: string | null = null;
  for (const from of [...new Set(reach.values())].sort().reverse()) {
    const covered = paidUp(active, charges, now);
    const open = active.some(
      (subscription) =>
        !covered.has(subscription.id) && (reach.get(subscription.id) ?? "9999") <= from,
    );
    if (!open) break;
    charges.push(...(await fetchChargesDue(key, live, from, upTo)));
    upTo = addDays(from, -1);
  }
  return charges;
}

/**
 * Asaas: MRR from active subscriptions that a paid charge covers, history from the paid charges
 * of subscriptions, and revenue from every paid charge, less refunds.
 */
export const asaas: ProviderAdapter = {
  id: "asaas",
  parseKey: ({ key }, options) => parseAsaasKey(key, options),
  async read(key, livemode, { allowTest, now, history }) {
    const live = await environment(key, livemode, allowTest);
    let subscriptions: AsaasSubscription[] | null = null;
    let charges: AsaasPayment[] | null = null;
    let historyNote: string | null = null;
    if (history)
      try {
        subscriptions = await fetchAllSubscriptions(key, live);
        charges = await fetchChargesDue(key, live, dayOf(historyWindowStart(now)), null);
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        subscriptions = charges = null;
        historyNote = revenueText("asaas.historyTooLarge");
      }
    const active = activeSubscriptions(
      subscriptions ?? (await fetchActiveSubscriptions(key, live)),
    );
    // The charges of the last 25 months hold those an hourly read looks at, so MRR does not depend
    // on whether the history was read.
    const forMrr = charges ?? (await coverageCharges(key, live, active, now));
    return {
      livemode: live,
      ...asaasMrr(active, forMrr, now),
      lines: subscriptions && charges ? asaasServiceLines(charges, subscriptions) : null,
      historyNote,
    };
  },
  async payments(key, livemode, { since, before, maxPages }) {
    await requireNarrowKey(key, livemode);
    const end = before ?? dayStart(dayOf(Date.now() / 1000)) + DAY;
    if (end <= since) return { payments: [], complete: true };
    const read = await fetchPaidWindow(key, livemode, since, end, maxPages);
    const payments = asaasPayments(read.payments, since, before);
    return read.complete
      ? { payments, complete: true }
      : { payments, complete: false, from: read.from };
  },
};
