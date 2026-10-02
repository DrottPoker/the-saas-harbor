// Notification emails: subject, plain text and HTML for each kind of queued email. Pure, so they
// are unit-tested. Message emails never contain the message itself.
import {
  milestoneHeadline,
  milestoneObject,
  milestonePath,
  milestoneSentence,
  notableMilestones,
  shareText,
} from "../milestones";
import { decisionLabels, isReason } from "../moderation";
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
  subject,
  name,
  body,
  picture,
  action,
  links = [],
  footer,
}: {
  origin: string;
  subject: string;
  name: string | null;
  body: string[];
  picture?: Picture;
  action: Link;
  /** Further links after the main action. */
  links?: Link[];
  footer: (string | Link)[];
}): Email {
  const greeting = name ? `Hi ${name},` : "Hi,";
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
    emailButton(action.label, action.url),
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

/** The email for a claimed row, or null when there is nothing to send any more. */
export function renderEmail(row: ClaimedEmail, { origin, contact }: EmailSettings): Email | null {
  const context = record(row.context);
  if (!context) return null;
  const settings = { label: "Choose which emails you get", url: `${origin}/dashboard/settings` };
  const disagree = contact
    ? `A person made this decision, not an automated system. If you think it is wrong, write to ${contact} and say why.`
    : "A person made this decision, not an automated system.";

  if (row.kind === "message") {
    const unread = count(context.unread);
    const sender = text(context.sender_name);
    if (!context.wanted || context.blocked || context.sender_suspended || !unread || !sender)
      return null;
    return compose({
      origin,
      subject: `New message from ${sender}`,
      name: row.name,
      body: [
        unread === 1
          ? `${sender} sent you a message on The SaaS Harbor.`
          : `${sender} sent you ${unread} messages on The SaaS Harbor.`,
      ],
      action: { label: "Read and reply", url: `${origin}/messages/${text(context.sender_id)}` },
      footer: [
        "You get one email per conversation until you read it, and it never contains the message.",
        settings,
      ],
    });
  }

  if (row.kind === "reports") {
    const open = count(context.open);
    if (!context.wanted || !open) return null;
    const reports = open === 1 ? "1 open report" : `${open} open reports`;
    return compose({
      origin,
      subject: `${reports} on The SaaS Harbor`,
      name: row.name,
      body: [`${open === 1 ? "A report waits" : `${open} reports wait`} for review.`],
      action: { label: "Open the report queue", url: `${origin}/admin/reports` },
      footer: ["You get at most one of these emails an hour, because you are an admin.", settings],
    });
  }

  if (row.kind === "decision") {
    const label = text(context.target_label);
    const reason = isReason(context.reason) ? decisionLabels[context.reason] : null;
    const note = text(context.note);
    const grounds = [
      ...(reason ? [`Reason: ${reason}`] : []),
      ...(note ? [`Explanation:\n${note}`] : []),
      disagree,
    ];
    const dashboard = { label: "Open your dashboard", url: `${origin}/dashboard` };
    const footer = [
      "This email is about your account, so it is sent even if you turned other emails off.",
      { label: "Terms", url: `${origin}/terms#moderation` },
    ];
    switch (context.action) {
      case "hide_saas":
        return compose({
          origin,
          subject: `An admin hid your product ${label}`,
          name: row.name,
          body: [
            `An admin hid ${label} on The SaaS Harbor. It is not shown anywhere on the site, and you can still edit or delete it.`,
            ...grounds,
          ],
          action: dashboard,
          footer,
        });
      case "restore_saas":
        return compose({
          origin,
          subject: `Your product ${label} is shown again`,
          name: row.name,
          body: [`An admin reviewed ${label} again, and it is shown on The SaaS Harbor again.`],
          action: dashboard,
          footer,
        });
      case "suspend_account":
        return compose({
          origin,
          subject: "Your account on The SaaS Harbor is suspended",
          name: row.name,
          body: [
            "An admin suspended your account. Your profile and products are hidden, and you cannot send messages or reports. You can still sign in, edit your products and delete your account.",
            ...grounds,
          ],
          action: dashboard,
          footer,
        });
      case "restore_account":
        return compose({
          origin,
          subject: "Your account on The SaaS Harbor is active again",
          name: row.name,
          body: [
            "An admin lifted the suspension of your account. Your profile and products are shown again, and you can send messages.",
          ],
          action: dashboard,
          footer,
        });
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
    const page = `${origin}${milestonePath(slug, lead)}`;
    const share = shareLinks(page, shareText(lead, name));
    const provider = isProviderId(context.provider) ? providerName(context.provider) : null;
    return compose({
      origin,
      subject: `${name} reached ${milestoneObject(lead)}`,
      name: row.name,
      body: [
        [
          milestoneSentence(lead, name),
          ...(other ? [`It also reached ${milestoneObject(other)}.`] : []),
          ...(provider ? [`The revenue is verified through ${provider}.`] : []),
        ].join(" "),
        "We made a card for it. When you share the link, the card shows with your post.",
      ],
      picture: {
        src: `${page}/opengraph-image`,
        alt: `${name}: ${milestoneHeadline(lead)} on The SaaS Harbor`,
        link: page,
        width: 480,
        height: 252,
      },
      action: { label: "Share on X", url: share.x },
      links: [
        { label: "Share on LinkedIn", url: share.linkedin },
        { label: "Open the milestone page", url: page },
      ],
      footer: [
        "You get this email once for each milestone your product reaches while its MRR is shared.",
        settings,
      ],
    });
  }

  if (row.kind === "outcome") {
    const name = text(context.name);
    const about =
      context.target === "message"
        ? "a message you received"
        : context.target === "saas"
          ? `the product ${name}`
          : `the profile of ${name}`;
    const outcome =
      context.status === "actioned"
        ? "They took action, for example by hiding the product or suspending the account."
        : context.status === "dismissed"
          ? "They found that it does not break the terms or the law, so they took no action."
          : null;
    if (!outcome) return null;
    return compose({
      origin,
      subject: "Your report has been reviewed",
      name: row.name,
      body: [`An admin reviewed your report about ${about}.`, outcome],
      action: { label: "See your reports", url: `${origin}/dashboard/reports` },
      footer: [
        "The reported user is not told who reported. This email is sent for every report you make.",
        { label: "Terms", url: `${origin}/terms#moderation` },
      ],
    });
  }

  return null;
}
