// Notification emails: subject, plain text and HTML for each kind of queued email. Pure, so they
// are unit-tested. Message emails never contain the message itself.
import { decisionLabels, isReason } from "../moderation";

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

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
// Subjects are one line, and parts of them come from makers.
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 150);

type Link = { label: string; url: string };

function compose({
  subject,
  name,
  body,
  action,
  footer,
}: {
  subject: string;
  name: string | null;
  body: string[];
  action: Link;
  footer: (string | Link)[];
}): Email {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const text = [
    greeting,
    ...body,
    `${action.label}: ${action.url}`,
    ...footer.map((part) => (typeof part === "string" ? part : `${part.label}: ${part.url}`)),
  ].join("\n\n");
  const paragraph = (content: string, style = "margin: 0 0 16px") =>
    `<p style="${style}">${content}</p>`;
  const small = "margin: 0 0 8px; color: #585c61; font-size: 13px";
  const html = [
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1a1b1e; max-width: 480px">`,
    paragraph(escape(greeting)),
    ...body.map((line) => paragraph(escape(line).replace(/\n/g, "<br>"))),
    paragraph(
      `<a href="${escape(action.url)}" style="display: inline-block; background: #1a1b1e; color: #fbfaf8; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600">${escape(action.label)}</a>`,
      "margin: 8px 0 24px",
    ),
    ...footer.map((part) =>
      paragraph(
        typeof part === "string"
          ? escape(part)
          : `<a href="${escape(part.url)}" style="color: #585c61">${escape(part.label)}</a>`,
        small,
      ),
    ),
    "</div>",
  ].join("\n");
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
    : "A person made this decision, not an automated system. The terms explain how to disagree with it.";

  if (row.kind === "message") {
    const unread = count(context.unread);
    const sender = text(context.sender_name);
    if (!context.wanted || context.blocked || context.sender_suspended || !unread || !sender)
      return null;
    return compose({
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
          subject: `Your product ${label} is shown again`,
          name: row.name,
          body: [`An admin reviewed ${label} again, and it is shown on The SaaS Harbor again.`],
          action: dashboard,
          footer,
        });
      case "suspend_account":
        return compose({
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
