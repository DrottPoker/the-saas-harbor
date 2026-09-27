import "server-only";
import { splitAccountKey } from "../account-key";
import { historyWindowStart } from "../history";
import { ProviderRequestError } from "../http";
import type { ProviderAdapter } from "../types";
import { fetchInvoices, fetchSubscriptions } from "./client";
import { parseChargebeeKey } from "./key";
import { chargebeeMrr, chargebeeServiceLines, invoiceWindowStart } from "./mrr";

/** Chargebee: MRR and history from paid invoices, for the subscriptions that are active. */
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
};
