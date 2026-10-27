import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { pickMessages, type Namespace } from "@/i18n/messages";

/** What every page's Client Components may need: the header, menus and error pages. */
export const PAGE_NAMESPACES = [
  "common",
  "chrome",
  "errors",
  "money",
] as const satisfies Namespace[];

/**
 * Gives the Client Components inside it the messages of these namespaces, besides the page's own.
 * Server Components read every message directly; only what the browser needs is sent to it.
 */
export async function ClientMessages({
  namespaces,
  children,
}: {
  namespaces: readonly Namespace[];
  children: ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={pickMessages(messages, [...PAGE_NAMESPACES, ...namespaces])}
    >
      {children}
    </NextIntlClientProvider>
  );
}
