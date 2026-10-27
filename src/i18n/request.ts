import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER } from "./config";
import { loadMessages } from "./messages";

// next-intl reads each request's language here. The proxy sets it from the address (/es/...);
// requests the proxy does not handle, such as API routes, are in English unless the code passes a
// language itself (`getTranslations({ locale })`).
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = (await requestLocale) ?? (await headers()).get(LOCALE_HEADER);
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    messages: await loadMessages(locale),
    // Pages format moments in the visitor's zone themselves (`LocalTime`); anything else is UTC.
    timeZone: "UTC",
    onError(error) {
      // A missing message falls back to English in `loadMessages`; anything left is a bug.
      console.error("Translation failed:", error.code, error.originalMessage ?? error.message);
    },
    getMessageFallback: ({ namespace, key }) => [namespace, key].filter(Boolean).join("."),
  };
});
