import "server-only";
import { VerificationError } from "../errors";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import {
  fetchAccount,
  fetchMemberships,
  fetchPayments,
  fetchPermissions,
  fetchPlan,
  fetchPromo,
} from "./client";
import { parseWhopKey } from "./key";
import {
  paymentWindowStart,
  promoCodesToRead,
  whopMrr,
  whopServiceLines,
  type WhopPlan,
  type WhopPromo,
} from "./mrr";

// A business sells a handful of plans; this caps the plan and promo code lookups of one run.
const MAX_LOOKUPS = 100;

/**
 * The environment and account of a key. Sandbox and production keys look alike, so a new key is
 * tried on production first, and on the sandbox where test keys are allowed.
 */
async function environment(key: string, livemode: boolean | null, allowTest: boolean) {
  if (livemode !== null) return { live: livemode, account: await fetchAccount(key, livemode) };
  try {
    return { live: true, account: await fetchAccount(key, true) };
  } catch (error) {
    if (!allowTest || !(error instanceof ProviderRequestError && error.status === 401)) throw error;
    return { live: false, account: await fetchAccount(key, false) };
  }
}

/** Refuses a key that holds any permission beyond reading, every time it is used. */
async function requireReadOnly(key: string, live: boolean, account: string) {
  const writes = (await fetchPermissions(key, live, account))
    .filter((permission) => permission.granted && !permission.action.endsWith(":read"))
    .map((permission) => permission.action);
  if (writes.length)
    throw new VerificationError(
      `The key can do more than read, for example ${writes.slice(0, 3).join(", ")}. Create a key with only the read permissions listed.`,
    );
}

async function lookUp<T>(ids: Iterable<string>, read: (id: string) => Promise<T>, what: string) {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_LOOKUPS)
    throw new ProviderRequestError(
      `The Whop account has more ${what} than one verification reads.`,
      undefined,
      undefined,
      true,
    );
  const found = new Map<string, T>();
  for (const id of unique)
    try {
      found.set(id, await read(id));
    } catch (error) {
      // A deleted plan or promo code leaves the charges made with it.
      if (!(error instanceof ProviderRequestError && error.status === 404)) throw error;
    }
  return found;
}

/** Whop: MRR from memberships, their plans and payments, and history from paid payments. */
export const whop: ProviderAdapter = {
  id: "whop",
  parseKey: ({ key }) => parseWhopKey(key),
  async read(key, livemode, { allowTest, now, history }) {
    const { live, account } = await environment(key, livemode, allowTest);
    await requireReadOnly(key, live, account);
    const memberships = [
      ...(await fetchMemberships(key, live, account, "active")),
      ...(await fetchMemberships(key, live, account, "past_due")),
    ];
    const paused = new Set(
      (await fetchMemberships(key, live, account, "paused")).map((membership) => membership.id),
    );
    const counted = memberships.filter((membership) => !paused.has(membership.id));
    const plans = await lookUp<WhopPlan>(
      counted.map((membership) => membership.plan_id),
      (id) => fetchPlan(key, live, id),
      "plans",
    );
    const recent = () => fetchPayments(key, live, account, paymentWindowStart(counted, plans, now));
    let payments;
    let historyNote: string | null = null;
    if (!history) payments = await recent();
    else
      try {
        payments = await fetchPayments(key, live, account, historyWindowStart(now));
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        payments = await recent();
        historyNote =
          "The Whop account has more payments than one verification reads, so there is no revenue history.";
      }
    const promos = await lookUp<WhopPromo>(
      promoCodesToRead(counted, payments),
      (id) => fetchPromo(key, live, id),
      "promo codes",
    );
    let lines = null;
    if (history && !historyNote) {
      const missing = payments.flatMap((payment) =>
        payment.plan_id && !plans.has(payment.plan_id) ? [payment.plan_id] : [],
      );
      try {
        const older = await lookUp<WhopPlan>(missing, (id) => fetchPlan(key, live, id), "plans");
        lines = whopServiceLines(payments, new Map([...plans, ...older]));
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        historyNote =
          "The Whop account has more plans than one verification reads, so there is no revenue history.";
      }
    }
    return {
      livemode: live,
      ...whopMrr(memberships, paused, plans, payments, promos),
      lines,
      historyNote,
    };
  },
};
