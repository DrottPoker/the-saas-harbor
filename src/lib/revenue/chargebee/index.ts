import "server-only";
import { splitAccountKey } from "../account-key";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchInvoices, fetchPaidInvoices, fetchRefunds, fetchSubscriptions } from "./client";
import { parseChargebeeKey } from "./key";
import { chargebeeMrr, chargebeeServiceLines, invoiceWindowStart } from "./mrr";
import { invoicePayments, refundedByInvoice } from "./payments";

/**
 * Chargebee: MRR and history from paid invoices, for the subscriptions that are active, and
 * revenue from every invoice with a payment, less cash refunds.
 */
export const chargebee: ProviderAdapter = {
  id: "chargebee",
  parseKey: (input, options) => parseChargebeeKey(input, options),
  async read(stored, livemode, { now, history }) {
    const { account: site, key } = splitAccountKey(stored);
    const live = livemode ?? !site.endsWith("-test");
    const subscriptions = await fetchSubscriptions(site, key);
    const recent = () => fetchInvoices(site, key, invoiceWindowStart(subscriptions, now));
    let invoices;
    let historyNote: string | null = null;
    if (!history) invoices = await recent();
    else
      try {
        invoices = await fetchInvoices(site, key, historyWindowStart(now));
      } catch (error) {
        if (!(error instanceof ProviderRequestError && error.tooMuchData)) throw error;
        invoices = await recent();
        historyNote =
          "The Chargebee site has more invoices than one verification reads, so there is no revenue history.";
      }
    return {
      livemode: live,
      ...chargebeeMrr(subscriptions, invoices),
      lines: history && !historyNote ? chargebeeServiceLines(invoices) : null,
      historyNote,
    };
  },
  async payments(stored, _livemode, { since, before, maxPages }) {
    const { account: site, key } = splitAccountKey(stored);
    const { invoices, complete } = await fetchPaidInvoices(site, key, since, before, maxPages);
    // Refunds come after the invoice they refund, so they are read from the window's start on.
    const refunds = invoices.length ? await fetchRefunds(site, key, since) : [];
    return { payments: invoicePayments(site, invoices, refundedByInvoice(refunds)), complete };
  },
};
