import type { ProviderId } from "./catalog";
import type { ServiceLine } from "./history";

/** A pasted key after validation. `livemode` is null when only the provider can tell. */
export type ParsedKey = { key: string; hint: string; livemode: boolean | null };

/** What one read of a provider account gives, before conversion to USD. */
export type ProviderReading = {
  livemode: boolean;
  /** MRR per lowercase currency code, in exact minor units. */
  byCurrency: Record<string, number>;
  /** Customers with a counted subscription worth more than zero. */
  customers: number;
  /** Every counted subscription, so one account cannot verify two products. */
  subscriptionIds: string[];
  /** Usage-based items or subscriptions that could not be valued. */
  skippedItems: number;
  /** Paid recurring charges for the history, or null with a note when there are none to read. */
  lines: ServiceLine[] | null;
  historyNote: string | null;
};

export type ReadOptions = { allowTest: boolean; now: Date };

export type ProviderAdapter = {
  id: ProviderId;
  parseKey(input: string, options: { allowTest: boolean }): ParsedKey;
  /** Reads the account. With `livemode` null, the adapter finds the key's environment. */
  read(key: string, livemode: boolean | null, options: ReadOptions): Promise<ProviderReading>;
};
