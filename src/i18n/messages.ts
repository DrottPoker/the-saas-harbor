import "server-only";
import en from "@/messages/en";
import type { Locale } from "./config";

export type Messages = typeof en;
export type Namespace = keyof Messages;

const loaders: Record<Exclude<Locale, "en">, () => Promise<{ default: unknown }>> = {
  zh: () => import("@/messages/zh"),
  hi: () => import("@/messages/hi"),
  ar: () => import("@/messages/ar"),
  es: () => import("@/messages/es"),
  ru: () => import("@/messages/ru"),
};

type Tree = { [key: string]: string | Tree };

// English fills any message a language lacks, so a missing translation shows the English text
// rather than a key.
function withFallback(base: Tree, translated: Tree): Tree {
  const merged: Tree = {};
  for (const [key, value] of Object.entries(base)) {
    const other = translated[key];
    merged[key] =
      typeof value === "string"
        ? typeof other === "string" && other
          ? other
          : value
        : withFallback(value, other && typeof other === "object" ? other : {});
  }
  return merged;
}

const cache = new Map<Locale, Promise<Messages>>();

/** Every message in a language, English where it has none. Merged once per process. */
export function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === "en") return Promise.resolve(en);
  let messages = cache.get(locale);
  if (!messages) {
    messages = loaders[locale]().then(
      (module) =>
        withFallback(en as unknown as Tree, module.default as Tree) as unknown as Messages,
    );
    cache.set(locale, messages);
  }
  return messages;
}

/** The namespaces a part of the page needs in the browser. */
export function pickMessages(messages: Messages, namespaces: readonly Namespace[]) {
  return Object.fromEntries(namespaces.map((name) => [name, messages[name]])) as Partial<Messages>;
}
