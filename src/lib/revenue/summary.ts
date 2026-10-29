// A verification's result in words for the founder, after connecting or refreshing.
import { getLocale, getTranslations } from "next-intl/server";
import { LOCALE_INFO, type Locale } from "@/i18n/config";
import { formatUsdIn } from "@/lib/display-money";
import { PROVIDERS } from "./catalog";
import { localizeRevenueText } from "./errors";
import type { Verification } from "./sync";

/**
 * What a verification found, in words for the founder: in the request's language, or in `locale`
 * for a request that has none, such as the return from an OAuth approval. MRR is in US dollars,
 * as it was verified. What could not be counted is said in each provider's terms
 * (`providers.<id>.skipped`), and the provider's notes follow in the founder's language.
 */
export async function verificationSummary(result: Verification, locale?: Locale) {
  const language = locale ?? (await getLocale());
  const [t, providers, mrrNote, historyNote] = await Promise.all([
    getTranslations({ locale: language, namespace: "revenue.result" }),
    getTranslations({ locale: language, namespace: "providers" }),
    localizeRevenueText(result.mrrNote, language),
    localizeRevenueText(result.historyNote, language),
  ]);
  return (
    [
      t("verified", {
        mrr: formatUsdIn(result.mrrCents, LOCALE_INFO[language].intl),
        count: result.customers,
      }),
      result.skippedItems
        ? providers(`${result.provider}.skipped`, { count: result.skippedItems })
        : null,
      mrrNote,
      historyNote,
    ]
      .filter(Boolean)
      // Sentences follow each other without a space in Chinese.
      .join(language === "zh" ? "" : " ")
  );
}

/** The answer to a new connection, such as "Stripe connected." with what was verified. */
export async function connectedSummary(result: Verification, locale?: Locale) {
  const language = locale ?? (await getLocale());
  const [t, summary] = await Promise.all([
    getTranslations({ locale: language, namespace: "revenue.result" }),
    verificationSummary(result, language),
  ]);
  return t("connected", { provider: PROVIDERS[result.provider].name, summary });
}
