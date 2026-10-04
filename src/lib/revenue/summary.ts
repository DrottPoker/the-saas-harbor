// A verification's result in words for the founder, after connecting or refreshing.
import { formatUsd } from "@/lib/domain";
import type { ProviderId } from "./catalog";
import type { Verification } from "./sync";

// What could not be counted, in each provider's terms.
const skipped: Record<ProviderId, [string, string]> = {
  stripe: ["usage-based item was", "usage-based items were"],
  paddle: ["subscription without a paid charge was", "subscriptions without a paid charge were"],
  polar: ["subscription was", "subscriptions were"],
  dodo: [
    "tax-inclusive subscription without a payment was",
    "tax-inclusive subscriptions without a payment were",
  ],
  creem: [
    "subscription without a readable price or payment was",
    "subscriptions without a readable price or payment were",
  ],
  chargebee: [
    "subscription without a paid invoice was",
    "subscriptions without a paid invoice were",
  ],
  whop: [
    "tax-inclusive membership without a payment was",
    "tax-inclusive memberships without a payment were",
  ],
  revenuecat: ["subscription was", "subscriptions were"],
  gumroad: ["subscriber without a recent charge was", "subscribers without a recent charge were"],
};

/** What a verification found, in words for the founder. */
export function summary(result: Verification) {
  const customers = `${result.customers} ${result.customers === 1 ? "subscriber" : "subscribers"}`;
  const [one, many] = skipped[result.provider];
  const notCounted = result.skippedItems
    ? ` ${result.skippedItems} ${result.skippedItems === 1 ? one : many} not counted.`
    : "";
  const mrr = result.mrrNote ? ` ${result.mrrNote}` : "";
  const history = result.historyNote ? ` ${result.historyNote}` : "";
  return `Verified MRR: ${formatUsd(result.mrrCents)} from ${customers}.${notCounted}${mrr}${history}`;
}
