// The Auth emails Supabase sends, in the same frame as the notification emails. They are Go
// templates: supabase/templates holds the output, which a unit test keeps in step with this file
// (`npx vitest run -u` rewrites it). The links open the app's confirm page, which verifies the token
// only when the reader presses its button, so they work in any browser and link scanners cannot use
// them up. RedirectTo is the app's /auth/confirm address, checked against the allowed redirect URLs.
//
// Supabase renders one template per type, so each holds every language and picks the user's from
// the `locale` in their metadata, which sign-up stores, with English for anything else. Users can
// write their metadata, so the value is printed to a string before it is compared: `eq` would fail
// on a number or an object, and a missing key or null prints as "<nil>". Supabase renders subjects as
// templates too (internal/mailer/templatemailer in supabase/auth), so `authSubjects` holds the
// subjects in supabase/config.toml, which another test compares.
import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, LOCALE_INFO, LOCALES, type Locale } from "@/i18n/config";
import ar from "@/messages/ar/emails.json";
import en from "@/messages/en/emails.json";
import es from "@/messages/es/emails.json";
import hi from "@/messages/hi/emails.json";
import ja from "@/messages/ja/emails.json";
import ru from "@/messages/ru/emails.json";
import zh from "@/messages/zh/emails.json";
import { emailButton, emailDocument, emailParagraph, escapeHtml } from "./layout";

const catalog: Record<Locale, typeof en> = { en, zh, hi, ar, es, ru, ja };
const note = "{{/* Generated from src/lib/email/auth-templates.ts. Do not edit by hand. */}}";
const userLocale = `(printf "%v" .Data.locale)`;
// English last, as the branch for every other value.
const others = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/** Go template branches for each language, English as the `else`. */
function byLocale(render: (locale: Locale) => string, trim = "") {
  return [
    ...others.map(
      (locale, index) =>
        `{{${trim} ${index ? "else if" : "if"} eq ${userLocale} "${locale}" }}${render(locale)}`,
    ),
    `{{${trim} else }}${render(DEFAULT_LOCALE)}`,
    `{{${trim} end }}`,
  ].join("");
}

type Kind = "confirmation" | "recovery" | "emailChange";

function translate(locale: Locale, kind: Kind) {
  return createTranslator({
    locale: LOCALE_INFO[locale].intl as Locale,
    messages: { emails: catalog[locale] },
    namespace: `emails.auth.${kind}`,
    // A missing translation must fail the test that writes the templates, not reach an inbox.
    onError(error) {
      throw error;
    },
  });
}

// Addresses keep their own direction inside right-to-left sentences.
const isolate = (locale: Locale, value: string) =>
  LOCALE_INFO[locale].dir === "rtl" ? `⁨${value}⁩` : value;

function authTemplate(kind: Kind, url: string) {
  const html = byLocale((locale) => {
    const t = translate(locale, kind);
    return `\n${emailDocument({
      origin: "{{ .SiteURL }}",
      locale,
      heading: t("heading"),
      preview: t("preview"),
      content: [
        emailParagraph(
          escapeHtml(
            t("body", {
              email: isolate(locale, "{{ .Email }}"),
              newEmail: isolate(locale, "{{ .NewEmail }}"),
            }),
          ),
        ),
        emailButton(t("action"), url, locale),
      ].join("\n"),
      footer: [escapeHtml(t("footer"))],
    })}\n`;
  }, "-");
  return `${note}\n${html}\n`;
}

const authSubject = (kind: Kind) => byLocale((locale) => translate(locale, kind)("subject"));

export const authTemplates = {
  confirmation: authTemplate(
    "confirmation",
    "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email",
  ),
  recovery: authTemplate("recovery", "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery"),
  // Sent to the current address and to the new one, each with its own link; the change is made
  // once both are confirmed.
  email_change: authTemplate(
    "emailChange",
    "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change",
  ),
};

/** The subjects for `[auth.email.template.*]` in supabase/config.toml. */
export const authSubjects: Record<keyof typeof authTemplates, string> = {
  confirmation: authSubject("confirmation"),
  recovery: authSubject("recovery"),
  email_change: authSubject("emailChange"),
};
