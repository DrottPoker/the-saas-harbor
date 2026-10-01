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
  /** What else MRR could not take into account, in words for the founder. */
  mrrNote?: string | null;
  /** Paid recurring charges for the history, or null with a note when there are none to read. */
  lines: ServiceLine[] | null;
  historyNote: string | null;
};

/** `history` false reads what MRR needs only, and returns no lines and no note. */
export type ReadOptions = { allowTest: boolean; now: Date; history: boolean };

/** What a maker pasted: the key, and the site or project it belongs to where one is asked for. */
export type KeyInput = { key: string; account: string };

/**
 * What a payment paid for: a subscription, a one-time purchase, or `unknown` where the provider
 * gives daily totals only. A payment for a subscription counts as one whole, one-time items on
 * the same charge included.
 */
export type PaymentKind = "subscription" | "one_time" | "unknown";

/**
 * A paid payment as a provider lists it. The fingerprint changes whenever what the payment earned
 * could have, such as after a refund. `value` is what it earned, in minor units after discounts
 * and refunds and without tax, or null for a payment left unvalued because it is unchanged.
 * `kind` is given whenever the payment is valued, and may be null for one left unvalued.
 */
export type ListedPayment = {
  id: string;
  /** When it was paid, in Unix seconds. */
  at: number;
  fingerprint: string;
  value: { currency: string; amount: number } | null;
  kind: PaymentKind | null;
};

/**
 * Payments of a window; `complete` when the read reached the window's start. An unfinished read
 * covers the window from `from` (Unix seconds, the start of a day) where it says so, or else from
 * the day after its oldest payment, as a list read newest first does.
 */
export type PaymentRead = { payments: ListedPayment[]; complete: boolean; from?: number };

/**
 * A payment as stored: its fingerprint, what it earned in minor units, and its kind, null for one
 * stored before kinds were read.
 */
export type StoredPayment = { fingerprint: string; amount: number; kind: PaymentKind | null };

/**
 * A window of payments: paid from `since` (inclusive) to `before` (exclusive, or up to now), read
 * for at most `maxPages` pages. `stored` gives a payment of the last six months, or of a window
 * read again for its kinds, as stored, so a provider whose valuation costs requests can skip
 * unchanged payments, or scale a changed one.
 */
export type PaymentOptions = {
  allowTest: boolean;
  since: number;
  before: number | null;
  maxPages: number;
  stored: (id: string) => StoredPayment | null;
};

export type ProviderAdapter = {
  id: ProviderId;
  parseKey(input: KeyInput, options: { allowTest: boolean }): ParsedKey;
  /** Reads the account. With `livemode` null, the adapter finds the key's environment. */
  read(key: string, livemode: boolean | null, options: ReadOptions): Promise<ProviderReading>;
  /** Reads the paid payments of a window, subscriptions and one-time purchases alike. */
  payments(key: string, livemode: boolean, options: PaymentOptions): Promise<PaymentRead>;
};
