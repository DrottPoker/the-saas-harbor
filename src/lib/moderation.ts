// Reports and admin decisions: reasons, statuses and labels. Pure, shared by server and client.
// The reasons match the public.moderation_reason domain in the database. The labels here are
// English, for the admin panel, emails and Telegram alerts; pages for users take theirs from the
// messages (reports.reasons, reports.list and moderation.decisions).
import type en from "@/messages/en";

export const REASONS = [
  "spam",
  "misleading",
  "impersonation",
  "harassment",
  "illegal",
  "other",
] as const;
export type Reason = (typeof REASONS)[number];

export const reasonLabels: Record<Reason, string> = {
  spam: "Spam or advertising",
  misleading: "Misleading or false information",
  impersonation: "Pretends to be someone else",
  harassment: "Harassment or hate",
  illegal: "Illegal content",
  other: "Something else",
};

// The ground of a decision, as the maker reads it.
export const decisionLabels: Record<Reason, string> = {
  ...reasonLabels,
  other: "Another breach of the terms",
};

// Reasons that need an explanation from the reporter.
export const DETAILS_REQUIRED: readonly Reason[] = ["illegal", "other"];
export const DETAILS_MAX_LENGTH = 1000;
export const NOTE_MAX_LENGTH = 1000;

// Product limits, enforced by the database.
export const PRODUCT_LIMIT = 20;
export const DAILY_PRODUCT_LIMIT = 5;

export const REPORT_TARGETS = ["saas", "profile", "message"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export const targetLabels: Record<ReportTarget, string> = {
  saas: "Product",
  profile: "Profile",
  message: "Message",
};

export type ReportStatus = "open" | "actioned" | "dismissed";
export const adminStatusLabels: Record<ReportStatus, string> = {
  open: "Open",
  actioned: "Action taken",
  dismissed: "Dismissed",
};
export const statusTones = { open: "accent", actioned: "success", dismissed: "neutral" } as const;

export type ModerationAction =
  "hide_saas" | "restore_saas" | "suspend_account" | "restore_account" | "dismiss_report";
export const actionLabels: Record<ModerationAction, string> = {
  hide_saas: "Hid product",
  restore_saas: "Showed product again",
  suspend_account: "Suspended account",
  restore_account: "Lifted suspension",
  dismiss_report: "Dismissed report",
};

export const isReason = (value: unknown): value is Reason => REASONS.includes(value as Reason);
export const isReportTarget = (value: unknown): value is ReportTarget =>
  REPORT_TARGETS.includes(value as ReportTarget);
export const isReportStatus = (value: unknown): value is ReportStatus =>
  value === "open" || value === "actioned" || value === "dismissed";

export function reportPath(target: ReportTarget, id: string) {
  return `/report/${target}/${id}`;
}

/** The start of a text on one line, cut at a word where possible. */
export function excerpt(text: string, max = 80) {
  const line = text.replace(/\s+/g, " ").trim();
  if ([...line].length <= max) return line;
  const cut = [...line].slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * What a report is about, from the copy stored with it: the start of a reported message, or the
 * name of a product or profile. Null when the copy has neither.
 */
export function reportSubject(report: { target: string; content: unknown }) {
  const content = (report.content ?? {}) as Record<string, unknown>;
  if (report.target === "message")
    return typeof content.body === "string" ? excerpt(content.body, 60) : null;
  return typeof content.name === "string" && content.name ? content.name : null;
}

/** A short title for a report in English, for the admin panel. */
export function reportTitle(report: { target: string; content: unknown }) {
  const subject = reportSubject(report);
  if (report.target === "message") return subject === null ? "A message" : `“${subject}”`;
  return subject ?? "Unnamed";
}

/**
 * The errors submit_report() raises for users (P0001), as keys in reports.errors, so they read in
 * the page's language. `detailsTooLong` takes the limit as `max`.
 */
export const REPORT_ERRORS = new Map<string, keyof (typeof en)["reports"]["errors"]>([
  ["Choose a reason", "chooseReason"],
  ["Keep the details under 1,000 characters", "detailsTooLong"],
  ["Describe the problem so it can be reviewed", "detailsRequired"],
  ["Your account is suspended, so you cannot send reports", "suspended"],
  ["You have sent many reports. Try again later", "tooMany"],
  ["This product could not be found", "productNotFound"],
  ["You cannot report your own product", "ownProduct"],
  ["This user could not be found", "userNotFound"],
  ["You cannot report yourself", "ownProfile"],
  ["This message could not be found", "messageNotFound"],
  ["You cannot report your own message", "ownMessage"],
  ["Choose what to report", "chooseTarget"],
  ["You already reported this, and it is waiting for review", "alreadyReported"],
]);
