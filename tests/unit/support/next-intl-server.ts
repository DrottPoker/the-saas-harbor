// Stands in for next-intl/server in unit tests, which run outside a Next.js request: the language
// is whatever `setTestLocale` last chose, English by default.
import { createFormatter, createTranslator } from "next-intl";
import type { Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";

let current: Locale = "en";

export function setTestLocale(locale: Locale) {
  current = locale;
}

type Options = { locale?: Locale; namespace?: string } | string | undefined;

function parse(options: Options) {
  return typeof options === "string"
    ? { locale: current, namespace: options }
    : { locale: options?.locale ?? current, namespace: options?.namespace };
}

export async function getLocale() {
  return current;
}

export async function getMessages(options?: { locale?: Locale }) {
  return loadMessages(options?.locale ?? current);
}

export async function getTranslations(options?: Options) {
  const { locale, namespace } = parse(options);
  return createTranslator({
    locale,
    messages: await loadMessages(locale),
    namespace: namespace as never,
    timeZone: "UTC",
  });
}

export async function getFormatter(options?: { locale?: Locale }) {
  return createFormatter({ locale: options?.locale ?? current, timeZone: "UTC" });
}
