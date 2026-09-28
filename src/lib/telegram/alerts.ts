// Telegram alerts about new accounts and feedback, in Telegram's HTML. Pure, so they are
// unit-tested. They name the user but never contain an email address.
import { FEEDBACK_KINDS, feedbackLabels, type FeedbackKind } from "../feedback";

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
  } else {
    return null;
  }
  return lines.filter((line) => line !== null).join("\n");
}
