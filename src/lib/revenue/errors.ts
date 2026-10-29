import { createTranslator } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import english from "@/messages/en/revenueErrors.json";
import { compileMessages, matchText, type Matcher } from "./message-match";

// The words a founder reads about a verification are the messages of `revenueErrors`. They are
// produced, logged and stored in English, and shown in the language of the request: by key where
// the error is at hand, otherwise by reading the English text back into its message.

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** A message in `revenueErrors`, such as `common.unreachable`. */
export type RevenueErrorKey = Leaves<typeof english>;
/** The values of a message's arguments: names and other text as they are, counts as numbers. */
export type RevenueErrorValues = Record<string, string | number>;

const translateEnglish = createTranslator({
  locale: "en",
  messages: { revenueErrors: english },
  namespace: "revenueErrors",
  onError(error) {
    // A missing argument is a bug; outside production it fails loudly.
    if (process.env.NODE_ENV !== "production") throw error;
    console.error("Revenue message failed:", error.code, error.originalMessage ?? error.message);
  },
  getMessageFallback: ({ key }) => key,
});

/** A message in English, as it is logged, stored and compared in tests. */
export function revenueText(key: RevenueErrorKey, values?: RevenueErrorValues) {
  return translateEnglish(key, values);
}

/**
 * A verification failure explained in words meant for the maker. Any other error reaches them as
 * a generic failure, so database and internal details never appear on the page. Its message is
 * the English text; `key` and `values` give it in another language. A text written elsewhere,
 * such as by the database or stored earlier, is passed as `{ text }` and has no key.
 */
export class VerificationError extends Error {
  readonly key: RevenueErrorKey | null;
  readonly values: RevenueErrorValues;

  constructor(key: RevenueErrorKey, values?: RevenueErrorValues, options?: ErrorOptions);
  constructor(message: { text: string }, options?: ErrorOptions);
  constructor(
    message: RevenueErrorKey | { text: string },
    second?: RevenueErrorValues | ErrorOptions,
    third?: ErrorOptions,
  ) {
    const keyed = typeof message === "string";
    const values = keyed ? ((second as RevenueErrorValues | undefined) ?? {}) : {};
    super(
      keyed ? revenueText(message, values) : message.text,
      keyed ? third : (second as ErrorOptions | undefined),
    );
    this.key = keyed ? message : null;
    this.values = values;
  }
}

/** A run that read a key the founder has replaced since; what it read is not stored. */
export const REPLACED_DURING_CHECK = revenueText("run.keyReplaced");

/** A run whose provider the founder has disconnected since; what it read is not stored. */
export const DISCONNECTED_DURING_CHECK = revenueText("run.disconnected");

/**
 * A write the database refused because the founder replaced the key or disconnected the provider
 * while the check ran, as words for the maker; null for any other failure.
 */
export function changedDuringCheck(message: string | undefined) {
  if (message?.includes("connection changed")) return new VerificationError("run.keyReplaced");
  if (message?.includes("not connected to this provider"))
    return new VerificationError("run.disconnected");
  return null;
}

type Tree = { [key: string]: string | Tree };
const flatten = (tree: Tree, prefix = ""): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value]] : flatten(value, `${prefix}${key}.`),
  );

let matchers: Matcher[] | null = null;

/**
 * The messages an English text consists of, with their arguments, or null when it is not made of
 * them. Compiled once per process.
 */
export function matchRevenueText(text: string) {
  matchers ??= compileMessages(Object.fromEntries(flatten(english as Tree)));
  return matchText(text, matchers) as { key: RevenueErrorKey; values: RevenueErrorValues }[] | null;
}

/** Messages in a language; English when none is given. */
async function translator(locale: Locale) {
  const t = await getTranslations({ locale, namespace: "revenueErrors" });
  return (key: RevenueErrorKey, values: RevenueErrorValues) => t(key, values);
}

// Sentences follow each other without a space in Chinese.
const joiner = (locale: Locale) => (locale === "zh" ? "" : " ");

/**
 * A text from revenue verification that a founder reads (an error, a note or a stored reason), in
 * the language of the request, or in `locale` where it is given, as in an email. Texts are stored
 * in English; one made of the messages is shown in the founder's language, anything else as it is.
 */
export async function localizeRevenueText(text: string, locale?: Locale): Promise<string>;
export async function localizeRevenueText(
  text: string | null | undefined,
  locale?: Locale,
): Promise<string | null>;
export async function localizeRevenueText(text: string | null | undefined, locale?: Locale) {
  if (text == null) return null;
  const language = locale ?? ((await getLocale()) as Locale);
  if (language === "en") return text;
  const parts = matchRevenueText(text);
  if (!parts) return text;
  const t = await translator(language);
  return parts.map(({ key, values }) => t(key, values)).join(joiner(language));
}

/** The words a maker sees for a failure, in English: its own message when it has one. */
export function makerMessage(error: unknown) {
  if (error instanceof VerificationError) return error.message;
  console.error("Revenue verification failed:", error instanceof Error ? error.message : error);
  return revenueText("failed");
}

/**
 * The words a maker sees for a failure, in the language of the request or `locale`: what
 * `makerMessage` gives, translated by key where the error has one.
 */
export async function localizedMakerMessage(error: unknown, locale?: Locale) {
  if (!(error instanceof VerificationError && error.key))
    return localizeRevenueText(makerMessage(error), locale);
  const language = locale ?? ((await getLocale()) as Locale);
  if (language === "en") return error.message;
  return (await translator(language))(error.key, error.values);
}
