import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/link";
import {
  Contact,
  englishLink,
  LegalList,
  LegalSection,
  legalLink,
  legalStrong,
  LegalVersion,
  sentenceGap,
} from "@/components/legal";
import { PageHeader, Shell } from "@/components/shell";
import { DEFAULT_LOCALE, LOCALE_INFO } from "@/i18n/config";
import { legalDate, operator, termsUpdated } from "@/lib/legal";
import { DAILY_PRODUCT_LIMIT, PRODUCT_LIMIT } from "@/lib/moderation";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms.meta");
  return pageMetadata({ title: t("title"), description: t("description"), path: "/terms" });
}

const ACCOUNT_RULES = ["name", "password", "delete"] as const;

const NOT_ALLOWED = [
  "illegal",
  "spam",
  "misleading",
  "impersonation",
  "harassment",
  "manipulation",
  "intrusion",
  "scraping",
] as const;

const LOSSES = ["profits", "reliance", "conduct", "errors", "thirdParty"] as const;

// Translations are for convenience; the English text is the binding one (see the Language
// section).
export default async function Terms() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("terms")]);
  const contact = () => <Contact />;
  return (
    <Shell size="narrow">
      <PageHeader title={t("meta.title")} description={t("meta.description")} />
      <div className="grid gap-10 border-t pt-10">
        <LegalVersion
          updated={t("updated", { date: legalDate(termsUpdated, LOCALE_INFO[locale].intl) })}
          notice={
            locale !== DEFAULT_LOCALE &&
            t.rich("translationNotice", { link: englishLink("/terms") })
          }
        />

        <LegalSection id="about" title={t("about.title")}>
          <p>
            {t.rich("about.body", {
              operator: operator.name,
              link: (chunks) => (
                <Link className={legalLink} href="/privacy">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </LegalSection>

        <LegalSection id="account" title={t("account.title")}>
          <LegalList>
            {ACCOUNT_RULES.map((key) => (
              <li key={key}>{t(`account.${key}`)}</li>
            ))}
          </LegalList>
        </LegalSection>

        <LegalSection id="content" title={t("content.title")}>
          <p>{t("content.ownership")}</p>
          <p>
            {t("content.checks", { productLimit: PRODUCT_LIMIT, dailyLimit: DAILY_PRODUCT_LIMIT })}
          </p>
        </LegalSection>

        <LegalSection id="rules" title={t("rules.title")}>
          <LegalList>
            {NOT_ALLOWED.map((key) => (
              <li key={key}>{t(`rules.${key}`)}</li>
            ))}
          </LegalList>
        </LegalSection>

        <LegalSection id="revenue" title={t("revenue.title")}>
          <p>
            {t.rich("revenue.source", {
              link: (chunks) => (
                <Link className={legalLink} href="/about">
                  {chunks}
                </Link>
              ),
            })}
          </p>
          <p>{t("revenue.noAdvice")}</p>
          <p>{t("revenue.keys")}</p>
        </LegalSection>

        <LegalSection id="messages" title={t("messages.title")}>
          <p>{t("messages.private")}</p>
          <p>{t("messages.dealings")}</p>
        </LegalSection>

        <LegalSection id="moderation" title={t("moderation.title")}>
          <p>
            {t("moderation.reporting")}
            {operator.email && (
              <>
                {sentenceGap(locale)}
                {t.rich("moderation.others", { contact })}
              </>
            )}
          </p>
          <p>{t("moderation.review")}</p>
          <LegalList>
            <li>{t.rich("moderation.hide", { b: legalStrong })}</li>
            <li>{t.rich("moderation.suspend", { b: legalStrong })}</li>
          </LegalList>
          <p>{t("moderation.decision")}</p>
          {operator.email && <p>{t.rich("moderation.appeal", { contact })}</p>}
        </LegalSection>

        <LegalSection id="changes" title={t("changes.title")}>
          <p>{t("changes.body")}</p>
        </LegalSection>

        <LegalSection id="warranties" title={t("warranties.title")}>
          <p>{t("warranties.body")}</p>
        </LegalSection>

        <LegalSection id="liability" title={t("liability.title")}>
          <p>{t("liability.intro", { operator: operator.name })}</p>
          <LegalList>
            {LOSSES.map((key) => (
              <li key={key}>{t(`liability.${key}`)}</li>
            ))}
          </LegalList>
          <p>{t("liability.exceptions")}</p>
        </LegalSection>

        <LegalSection id="indemnification" title={t("indemnification.title")}>
          <p>{t("indemnification.body", { operator: operator.name })}</p>
        </LegalSection>

        <LegalSection id="law" title={t("law.title")}>
          <p>{t("law.body")}</p>
        </LegalSection>

        <LegalSection id="language" title={t("language.title")}>
          <p>{t("language.body")}</p>
        </LegalSection>

        {operator.email && (
          <LegalSection id="contact" title={t("contact.title")}>
            <p>{t.rich("contact.body", { contact })}</p>
          </LegalSection>
        )}
      </div>
    </Shell>
  );
}
