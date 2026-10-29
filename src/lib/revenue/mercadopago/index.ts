import "server-only";
import { revenueText, VerificationError } from "../errors";
import { historyWindowStart, type ServiceLine } from "../history";
import { MAX_PAGES, ProviderRequestError, tooMuchData } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchPayments, fetchPreapproval, fetchPreapprovals } from "./client";
import {
  decodeMercadoPagoKey,
  encodeMercadoPagoKey,
  parseMercadoPagoKey,
  type MercadoPagoKey,
} from "./key";
import {
  isSale,
  mercadoPagoMrr,
  mercadoPagoServiceLines,
  preapprovalOf,
  searchStart,
  type MercadoPagoPayment,
  type MercadoPagoPreapproval,
} from "./mrr";
import { MercadoPagoTokenError, mercadoPagoClient, refreshMercadoPagoKey } from "./oauth";
import { mercadoPagoPayments } from "./payments";

const DAY = 86_400;
/** An access token is renewed once fewer than this many seconds of it remain. */
export const RENEW_BEFORE = 30 * DAY;
/** An access token this close to its expiry is not used. */
const EXPIRY_MARGIN = 3_600;
/** Ended subscriptions in the history are looked up one by one, at most this many a run. */
const MAX_LOOKUPS = 100;

function requireMode(live: boolean, allowTest: boolean) {
  if (!live && !allowTest) throw new VerificationError("mercadopago.testAccount");
}

/** Whether a key's access token is due for renewal at `now` (Unix seconds). */
export function renewalDue(key: MercadoPagoKey, now: number) {
  return key.expiresAt - now <= RENEW_BEFORE;
}

/**
 * New tokens once the access token has fewer than 30 days left, or null when it has more. A
 * renewal that fails leaves the access token in use while it still works: another run may have
 * renewed the tokens a moment before, which spends the refresh token this run holds.
 */
async function renewIfDue(key: MercadoPagoKey, now: Date) {
  const seconds = Math.floor(now.getTime() / 1000);
  if (!renewalDue(key, seconds)) return null;
  const client = mercadoPagoClient();
  try {
    if (!client) throw new MercadoPagoTokenError("mercadopago.notConfigured", {}, false);
    return await refreshMercadoPagoKey(client, key, now);
  } catch (error) {
    if (!(error instanceof MercadoPagoTokenError)) throw error;
    if (key.expiresAt > seconds + EXPIRY_MARGIN) {
      console.warn("A Mercado Pago access token could not be renewed:", error.message);
      return null;
    }
    if (error.refused) throw new VerificationError("mercadopago.noLongerAccepted");
    throw error;
  }
}

/** The subscriptions that charges name but the authorized ones do not include, such as ended ones. */
async function missingPreapprovals(
  token: string,
  payments: MercadoPagoPayment[],
  known: ReadonlyMap<string, MercadoPagoPreapproval>,
  live: boolean,
  userId: string,
) {
  const ids = new Set(
    payments.flatMap((payment) => {
      const id = isSale(payment, live, userId) && preapprovalOf(payment);
      return id && !known.has(id) ? [id] : [];
    }),
  );
  if (ids.size > MAX_LOOKUPS)
    throw new ProviderRequestError(
      "mercadopago.tooManyEnded",
      {},
      { path: "/preapproval", tooMuchData: true },
    );
  const found = new Map<string, MercadoPagoPreapproval>();
  for (const id of ids) {
    const preapproval = await fetchPreapproval(token, id);
    if (preapproval) found.set(id, preapproval);
  }
  return found;
}

/**
 * Mercado Pago, connected through OAuth with a token that can only read: MRR from authorized
 * subscriptions (preapprovals), and history and revenue from approved payments, which Mercado Pago
 * lists for the last twelve months. Tokens are renewed during a read, never while payments are
 * read, which run on their own and must not spend the stored refresh token.
 */
export const mercadopago: ProviderAdapter = {
  id: "mercadopago",
  parseKey: () => parseMercadoPagoKey(),
  async read(stored, livemode, { allowTest, now, history }) {
    const held = decodeMercadoPagoKey(stored);
    const live = livemode ?? !held.accessToken.startsWith("TEST-");
    requireMode(live, allowTest);
    const renewed = await renewIfDue(held, now);
    const key = renewed ?? held;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const authorized = await fetchPreapprovals(key.accessToken, "authorized", MAX_PAGES);
    let lines: ServiceLine[] | null = null;
    let historyNote: string | null = null;
    if (history)
      try {
        const read = await fetchPayments(key.accessToken, key.userId, {
          since: Math.max(historyWindowStart(now), searchStart(nowSeconds)),
          before: nowSeconds,
          maxPages: MAX_PAGES,
        });
        if (!read.complete) throw tooMuchData("Mercado Pago", "/v1/payments/search");
        const known = new Map(authorized.map((preapproval) => [preapproval.id, preapproval]));
        const ended = await missingPreapprovals(
          key.accessToken,
          read.payments,
          known,
          live,
          key.userId,
        );
        lines = mercadoPagoServiceLines(
          read.payments,
          new Map([...known, ...ended]),
          live,
          key.userId,
        );
        if (!lines) historyNote = revenueText("mercadopago.noSubscriptionNames");
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        historyNote = revenueText("mercadopago.historyTooLarge");
      }
    return {
      livemode: live,
      ...mercadoPagoMrr(authorized, nowSeconds, key.userId),
      lines,
      historyNote,
      ...(renewed ? { renewedKey: encodeMercadoPagoKey(renewed) } : {}),
    };
  },
  // Payments from before Mercado Pago's twelve months cannot be listed, so a read that reaches
  // them is complete.
  async payments(stored, livemode, { allowTest, since, before, maxPages }) {
    const key = decodeMercadoPagoKey(stored);
    requireMode(livemode, allowTest);
    const now = Math.floor(Date.now() / 1000);
    if (key.expiresAt <= now) throw new VerificationError("mercadopago.accessExpired");
    const from = Math.max(since, searchStart(now));
    const end = before ?? now;
    if (end <= from) return { payments: [], complete: true };
    const read = await fetchPayments(key.accessToken, key.userId, {
      since: from,
      before: end,
      maxPages,
    });
    const payments = mercadoPagoPayments(read.payments, livemode, key.userId).filter(
      (payment) => payment.at >= since && (before === null || payment.at < before),
    );
    return read.complete
      ? { payments, complete: true }
      : { payments, complete: false, from: read.from };
  },
};
