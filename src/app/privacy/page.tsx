import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Contact,
  englishLink,
  legalStrong,
  LegalList as List,
  LegalSection as Section,
  LegalVersion,
  sentenceGap,
} from "@/components/legal";
import { PageHeader, Shell } from "@/components/shell";
import { DEFAULT_LOCALE, LOCALE_INFO } from "@/i18n/config";
import { formatList } from "@/i18n/list";
import { legalDate, operator, privacyUpdated } from "@/lib/legal";
import { availableProviders } from "@/lib/revenue/available";
import { providerNames } from "@/lib/revenue/catalog";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy.meta");
  return pageMetadata({ title: t("title"), description: t("description"), path: "/privacy" });
}

// What "What we store" lists, in order.
const STORED = [
  "account",
  "google",
  "profile",
  "products",
  "revenue",
  "milestones",
  "messages",
  "reports",
  "feedback",
  "emails",
  "visits",
  "source",
  "usage",
  "preferences",
] as const;

const PURPOSES = ["service", "security", "moderation", "improvement", "contact"] as const;

const AUDIENCES = ["everyone", "you", "correspondents", "admins", "providers"] as const;

// The policy describes how the service handles personal data today, without promises about how
// it will work, so it can follow the service as it changes. Translations are for convenience; the
// English text is the binding one.
export default async function Privacy() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("privacy")]);
  // Sentences that name the contact address show once it is set in src/lib/legal.ts.
  const contact = operator.email ? () => <Contact /> : null;
  const gap = sentenceGap(locale);
  const providers = formatList(providerNames(availableProviders()), locale, "disjunction");
  return (
    <Shell size="narrow">
      <PageHeader title={t("meta.title")} description={t("meta.description")} />
      <div className="grid gap-10 border-t pt-10">
        <LegalVersion
          updated={t("updated", { date: legalDate(privacyUpdated, LOCALE_INFO[locale].intl) })}
          notice={
            locale !== DEFAULT_LOCALE &&
            t.rich("translationNotice", { link: englishLink("/privacy") })
          }
        />

        <Section id="responsible" title={t("responsible.title")}>
          <p>
            {t("responsible.body", { operator: operator.name })}
            {contact && (
              <>
                {gap}
                {t.rich("responsible.contact", { contact })}
              </>
            )}
          </p>
        </Section>

        <Section id="data" title={t("data.title")}>
          <List>
            {STORED.map((key) => (
              <li key={key}>{t.rich(`data.${key}`, { b: legalStrong, providers })}</li>
            ))}
          </List>
        </Section>

        <Section id="revenue" title={t("revenue.title")}>
          <p>{t("revenue.read")}</p>
          <p>{t("revenue.disconnect")}</p>
        </Section>

        <Section id="website" title={t("website.title")}>
          <p>{t("website.body")}</p>
        </Section>

        <Section id="time-zone" title={t("timeZone.title")}>
          <p>{t("timeZone.body")}</p>
        </Section>

        <Section id="language" title={t("language.title")}>
          <p>{t("language.choice")}</p>
          <p>{t("language.account")}</p>
          <p>{t("language.rates")}</p>
        </Section>

        <Section id="purposes" title={t("purposes.title")}>
          <List>
            {PURPOSES.map((key) => (
              <li key={key}>{t(`purposes.${key}`)}</li>
            ))}
          </List>
          <p>{t("purposes.choices")}</p>
        </Section>

        <Section id="statistics" title={t("statistics.title")}>
          <p>{t("statistics.collected")}</p>
          <p>{t("statistics.access")}</p>
          <p>{t("statistics.vercel")}</p>
        </Section>

        <Section id="visibility" title={t("visibility.title")}>
          <List>
            {AUDIENCES.map((key) => (
              <li key={key}>{t.rich(`visibility.${key}`, { b: legalStrong })}</li>
            ))}
          </List>
          <p>{t("visibility.outboundLinks")}</p>
          <p>{t("visibility.disclosure")}</p>
        </Section>

        <Section id="cookies" title={t("cookies.title")}>
          <p>{t("cookies.body")}</p>
        </Section>

        <Section id="retention" title={t("retention.title")}>
          <p>{t("retention.periods")}</p>
          <p>{t("retention.security")}</p>
        </Section>

        <Section id="rights" title={t("rights.title")}>
          <p>{t("rights.self")}</p>
          <p>
            {t("rights.gdpr")}
            {contact && (
              <>
                {gap}
                {t.rich("rights.contact", { contact })}
              </>
            )}
            {gap}
            {t("rights.complaint")}
          </p>
        </Section>

        <Section id="changes" title={t("changes.title")}>
          <p>{t("changes.body")}</p>
        </Section>
      </div>
    </Shell>
  );
}
