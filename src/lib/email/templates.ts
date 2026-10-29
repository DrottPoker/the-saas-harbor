// Notification emails: subject, plain text and HTML for each kind of queued email, in the
// recipient's language (the `emails` messages). Pure apart from loading the messages, so they are
// unit-tested. Message emails never contain the message itself.
import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, isLocale, LOCALE_INFO, localizedPath, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import { formatMoney, formatUsdIn, usdMoney } from "../display-money";
import { milestonePath, notableMilestones, type Milestone } from "../milestones";
import { isReason } from "../moderation";
import { isProviderId, providerName } from "../revenue/catalog";
import { shareLinks } from "../share";
import {
  emailButton,
  emailColors,
  emailDocument,
  emailLink,
  emailParagraph,
  escapeHtml,
} from "./layout";

/** A row from claim_emails(). The context is computed when the email is claimed. */
export type ClaimedEmail = {
  id: number;
  kind: string;
  email: string;
  name: string | null;
  context: unknown;
  /** The recipient's language from their account; English when missing. */
  locale?: string | null;
};
export type Email = { subject: string; text: string; html: string };
export type EmailSettings = { origin: string; contact: string | null };

// Subjects are one line, and parts of them come from makers.
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 150);

type Link = { label: string; url: string };
/** A picture in the HTML part that links somewhere, such as a sharing card. */
type Picture = { src: string; alt: string; link: string; width: number; height: number };

function compose({
  origin,
  locale,
  subject,
  greeting,
  body,
  picture,
  action,
  links = [],
  footer,
}: {
  origin: string;
  locale: Locale;
  subject: string;
  greeting: string;
  body: string[];
  picture?: Picture;
  action: Link;
  /** Further links after the main action. */
  links?: Link[];
  footer: (string | Link)[];
}): Email {
  const text = [
    greeting,
    ...body,
    `${action.label}: ${action.url}`,
    ...links.map((link) => `${link.label}: ${link.url}`),
    ...footer.map((part) => (typeof part === "string" ? part : `${part.label}: ${part.url}`)),
  ].join("\n\n");
  const content = [
    emailParagraph(escapeHtml(greeting)),
    ...body.map((line) => emailParagraph(escapeHtml(line).replace(/\n/g, "<br>"))),
    ...(picture
      ? [
          emailParagraph(
            `<a href="${escapeHtml(picture.link)}"><img src="${escapeHtml(picture.src)}" alt="${escapeHtml(picture.alt)}" width="${picture.width}" height="${picture.height}" style="display: block; width: 100%; max-width: ${picture.width}px; height: auto; border: 1px solid ${emailColors.border}; border-radius: 8px"></a>`,
          ),
        ]
      : []),
    emailButton(action.label, action.url, locale),
    ...(links.length
      ? [
          emailParagraph(
            links.map((link) => emailLink(link.label, link.url)).join("&nbsp;&nbsp;·&nbsp;&nbsp;"),
            "16px 0 0",
          ),
        ]
      : []),
  ].join("\n");
  const html = emailDocument({
    origin,
    locale,
    heading: oneLine(subject),
    preview: oneLine(body[0] ?? subject),
    content,
    footer: footer.map((part) =>
      typeof part === "string"
        ? escapeHtml(part)
        : `<a href="${escapeHtml(part.url)}" style="color: ${emailColors.mutedForeground}; text-decoration: underline">${escapeHtml(part.label)}</a>`,
    ),
  });
  return { subject: oneLine(subject), text, html };
}

const record = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);

async function translator(locale: Locale) {
  return createTranslator({
    // The Intl form of the language, so numbers follow the site (Western digits in Arabic).
    locale: LOCALE_INFO[locale].intl as Locale,
    messages: await loadMessages(locale),
    namespace: "emails",
  });
}

// Text people wrote, such as names, keeps its own direction inside right-to-left sentences.
const FIRST_STRONG_ISOLATE = "⁨";
const POP_ISOLATE = "⁩";
const isolator = (locale: Locale) =>
  LOCALE_INFO[locale].dir === "rtl"
    ? (value: string) =>
        value
          .split("\n")
          .map((line) => `${FIRST_STRONG_ISOLATE}${line}${POP_ISOLATE}`)
          .join("\n")
    : (value: string) => value;

/** The email for a claimed row, or null when there is nothing to send any more. */
export async function renderEmail(
  row: ClaimedEmail,
  { origin, contact }: EmailSettings,
): Promise<Email | null> {
  const context = record(row.context);
  if (!context) return null;
  const locale = isLocale(row.locale) ? row.locale : DEFAULT_LOCALE;
  const t = await translator(locale);
  const own = isolator(locale);
  const page = (path: string) => `${origin}${localizedPath(locale, path)}`;
  const base = {
    origin,
    locale,
    greeting: row.name ? t("greeting", { name: own(row.name) }) : t("greetingNoName"),
  };
  const settings = { label: t("settings"), url: page("/dashboard/settings") };
  const terms = { label: t("terms"), url: page("/terms#moderation") };

  if (row.kind === "message") {
    const unread = count(context.unread);
    const sender = text(context.sender_name);
    if (!context.wanted || context.blocked || context.sender_suspended || !unread || !sender)
      return null;
    return compose({
      ...base,
      subject: t("message.subject", { sender: own(sender) }),
      body: [t("message.body", { count: unread, sender: own(sender) })],
      action: { label: t("message.action"), url: page(`/messages/${text(context.sender_id)}`) },
      footer: [t("message.footer"), settings],
    });
  }

  if (row.kind === "reports") {
    const open = count(context.open);
    if (!context.wanted || !open) return null;
    // The admin panel has one address, in English.
    return compose({
      ...base,
      subject: t("reports.subject", { count: open }),
      body: [t("reports.body", { count: open })],
      action: { label: t("reports.action"), url: `${origin}/admin/reports` },
      footer: [t("reports.footer"), settings],
    });
  }

  if (row.kind === "decision") {
    const label = own(text(context.target_label));
    const reason = isReason(context.reason) ? t(`decision.reasons.${context.reason}`) : null;
    const note = text(context.note);
    const grounds = [
      ...(reason ? [t("decision.reason", { reason })] : []),
      ...(note ? [`${t("decision.explanation")}\n${own(note)}`] : []),
      contact ? t("decision.personContact", { contact: own(contact) }) : t("decision.person"),
    ];
    const decision = (subject: string, body: string[]) =>
      compose({
        ...base,
        subject,
        body,
        action: { label: t("decision.dashboard"), url: page("/dashboard") },
        footer: [t("decision.footer"), terms],
      });
    switch (context.action) {
      case "hide_saas":
        return decision(t("decision.hideSaas.subject", { name: label }), [
          t("decision.hideSaas.body", { name: label }),
          ...grounds,
        ]);
      case "restore_saas":
        return decision(t("decision.restoreSaas.subject", { name: label }), [
          t("decision.restoreSaas.body", { name: label }),
        ]);
      case "suspend_account":
        return decision(t("decision.suspendAccount.subject"), [
          t("decision.suspendAccount.body"),
          ...grounds,
        ]);
      case "restore_account":
        return decision(t("decision.restoreAccount.subject"), [t("decision.restoreAccount.body")]);
      default:
        return null;
    }
  }

  if (row.kind === "milestone") {
    const name = text(context.name);
    const slug = text(context.slug);
    const reached = Array.isArray(context.milestones)
      ? notableMilestones(context.milestones.filter((key) => typeof key === "string"))
      : [];
    const [lead, other] = reached;
    // The card and the page show the milestone only while the MRR is verified and shared.
    if (!context.wanted || !context.shown || !name || !slug || !lead) return null;
    // Thresholds are US dollars in every language, written the way the language writes them.
    const intl = LOCALE_INFO[locale].intl;
    const say = (
      key: "subject" | "sentence" | "also" | "alt" | "share",
      milestone: Milestone,
      product: string,
    ) =>
      milestone.kind === "mrr"
        ? t(`milestone.${key}.mrr`, {
            name: product,
            amount:
              key === "sentence"
                ? formatUsdIn(milestone.usd * 100, intl)
                : formatMoney(milestone.usd * 100, usdMoney(intl), "compact"),
          })
        : milestone.place === 1
          ? t(`milestone.${key}.first`, { name: product })
          : t(`milestone.${key}.top`, { name: product, place: milestone.place });
    const path = milestonePath(slug, lead);
    const link = page(path);
    // The post is the founder's own text, so it carries no direction marks.
    const share = shareLinks(link, say("share", lead, name));
    const provider = isProviderId(context.provider) ? providerName(context.provider) : null;
    return compose({
      ...base,
      subject: say("subject", lead, own(name)),
      body: [
        [
          say("sentence", lead, own(name)),
          ...(other ? [say("also", other, "")] : []),
          ...(provider ? [t("milestone.provider", { provider })] : []),
        ].join(locale === "zh" ? "" : " "),
        t("milestone.card"),
      ],
      picture: {
        // Sharing images are the same in every language.
        src: `${origin}${path}/opengraph-image`,
        alt: say("alt", lead, own(name)),
        link,
        width: 480,
        height: 252,
      },
      action: { label: t("milestone.shareX"), url: share.x },
      links: [
        { label: t("milestone.shareLinkedIn"), url: share.linkedin },
        { label: t("milestone.page"), url: link },
      ],
      footer: [t("milestone.footer"), settings],
    });
  }

  if (row.kind === "outcome") {
    const name = own(text(context.name));
    const about =
      context.target === "message"
        ? t("outcome.about.message")
        : context.target === "saas"
          ? t("outcome.about.saas", { name })
          : t("outcome.about.profile", { name });
    const outcome =
      context.status === "actioned"
        ? t("outcome.actioned")
        : context.status === "dismissed"
          ? t("outcome.dismissed")
          : null;
    if (!outcome) return null;
    return compose({
      ...base,
      subject: t("outcome.subject"),
      body: [about, outcome],
      action: { label: t("outcome.action"), url: page("/dashboard/reports") },
      footer: [t("outcome.footer"), terms],
    });
  }

  return null;
}
