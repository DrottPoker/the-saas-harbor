// Telegram alerts about new accounts, feedback, products, reports and messages, in Telegram's HTML.
// Pure, so they are unit-tested. They name the user but never contain an email address or a
// message.
import { FEEDBACK_KINDS, feedbackLabels, type FeedbackKind } from "../feedback";
import { REASONS, reasonLabels, type Reason } from "../moderation";

export type ClaimedAlert = {
  id: number;
  kind: string;
  user_id: string;
  feedback_id: string | null;
  context: unknown;
};

const providers: Record<string, string> = { email: "email", google: "Google", github: "GitHub" };

// Telegram's HTML needs only these escaped.
const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// "Lena Berg (@lena)", or "@lena" when the name is the username, as it is after sign-up.
function who(context: Record<string, unknown>) {
  const name = text(context.name);
  const username = text(context.username);
  if (!username) return name || "A user without a profile";
  return !name || name === username ? `@${username}` : `${name} (@${username})`;
}

const link = (href: string, label: string) => `<a href="${escape(href)}">${escape(label)}</a>`;

const isKind = (value: unknown): value is FeedbackKind =>
  FEEDBACK_KINDS.includes(value as FeedbackKind);
const isReason = (value: unknown): value is Reason => REASONS.includes(value as Reason);

// What a report is about: the product by name, or whose profile or message it is.
function reported(c: Record<string, unknown>) {
  const subject = text(c.subject_name) || "a user";
  if (c.target === "saas") return `the product ${text(c.target_name) || "without a name"}`;
  if (c.target === "profile") return `the profile of ${subject}`;
  return `a message from ${subject}`;
}

/** The message for a claimed alert, or null when there is nothing to send any more. */
export function renderAlert(alert: ClaimedAlert, origin: string): string | null {
  const { context } = alert;
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const c = context as Record<string, unknown>;
  let lines: (string | null)[];
  if (alert.kind === "signup") {
    const provider = providers[text(c.provider)] ?? "email";
    lines = [
      "<b>New account</b>",
      `${escape(who(c))} signed up with ${provider}.`,
      c.confirmed === false ? "The email address is not confirmed yet." : null,
      typeof c.accounts === "number"
        ? `${c.accounts.toLocaleString("en-US")} accounts in all.`
        : null,
      link(`${origin}/admin/accounts/${alert.user_id}`, "Open the account"),
    ];
  } else if (alert.kind === "feedback") {
    const message = text(c.message);
    if (!message) return null;
    const kind = isKind(c.feedback_kind) ? feedbackLabels[c.feedback_kind] : "Feedback";
    const page = text(c.page);
    lines = [
      `<b>New feedback: ${escape(kind)}</b>`,
      `From ${escape(who(c))}${page ? ` on <code>${escape(page)}</code>` : ""}:`,
      `<blockquote>${escape(message)}</blockquote>`,
      link(`${origin}/admin/feedback`, "Open the feedback"),
    ];
  } else if (alert.kind === "saas") {
    const product = text(c.product);
    const slug = text(c.slug);
    if (!product || !slug || c.hidden === true) return null;
    lines = [
      "<b>New product</b>",
      `${escape(product)} by ${escape(who(c))}, in ${escape(text(c.category) || "Other")}.`,
      text(c.tagline) ? `<blockquote>${escape(text(c.tagline))}</blockquote>` : null,
      link(`${origin}/saas/${slug}`, "Open the product"),
    ];
  } else if (alert.kind === "report") {
    const id = text(c.report_id);
    if (!id) return null;
    const details = text(c.details);
    const open = typeof c.open_reports === "number" ? c.open_reports : null;
    lines = [
      "<b>New report</b>",
      `${escape(who(c))} reported ${escape(reported(c))}: ${escape(
        isReason(c.reason) ? reasonLabels[c.reason] : "Something else",
      )}.`,
      details ? `<blockquote>${escape(details)}</blockquote>` : null,
      open === null ? null : open === 1 ? "1 open report." : `${open} open reports.`,
      link(`${origin}/admin/reports/${id}`, "Open the report"),
    ];
  } else if (alert.kind === "message") {
    // Only while the account still wants them, and never from a blocked or suspended sender.
    const sender = text(c.sender_id);
    if (!sender || c.wanted !== true || c.blocked === true || c.sender_suspended === true)
      return null;
    lines = [
      "<b>New message</b>",
      `${escape(who(c))} wrote to you.`,
      link(`${origin}/messages/${sender}`, "Read and reply"),
    ];
  } else {
    return null;
  }
  return lines.filter((line) => line !== null).join("\n");
}
