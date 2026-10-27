import "server-only";
import type { ProviderAdapter } from "../types";
import {
  accessToken,
  fetchOrganizationCurrency,
  fetchPayments,
  fetchSubscriptions,
} from "./client";
import { parseZohoKey, readZohoKey } from "./key";
import { SUBSCRIPTION_FILTERS, zohoMrr } from "./mrr";
import { inWindow, zohoPayments } from "./payments";

/** Why a Zoho Billing product has no revenue history. */
export const NO_HISTORY =
  "Zoho Billing's invoice list does not say which subscription or period an invoice pays for, so there is no revenue history.";

/**
 * Zoho Billing, connected through OAuth with READ scopes only (`oauth.ts`): MRR from the live,
 * non-renewing and past-due subscriptions, each at what it is charged per billing interval, and
 * revenue from the customer payments, less refunds. Each read exchanges the refresh token for an
 * access token, three list requests serve MRR, and the payments are read whole about once a day.
 */
export const zoho: ProviderAdapter = {
  id: "zoho",
  parseKey: () => parseZohoKey(),
  async read(stored, _livemode, { history }) {
    const token = await accessToken(stored);
    const subscriptions = await fetchSubscriptions(stored, token, SUBSCRIPTION_FILTERS);
    return {
      livemode: true,
      ...zohoMrr(subscriptions),
      // A history would need a request per invoice, which Zoho's daily API limit does not allow.
      lines: null,
      historyNote: history ? NO_HISTORY : null,
    };
  },
  // The whole list is read every time, so every read is complete.
  async payments(stored, _livemode, { since, before, maxPages }) {
    const token = await accessToken(stored);
    const listed = await fetchPayments(stored, token, maxPages);
    const currency = listed.some((payment) => !payment.currency_code)
      ? await fetchOrganizationCurrency(stored, token)
      : null;
    const payments = zohoPayments(readZohoKey(stored).organizationId, listed, currency);
    return { payments: payments.filter((p) => inWindow(p, since, before)), complete: true };
  },
};
