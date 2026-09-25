// Reports and admin decisions: reasons, statuses and labels. Pure, shared by server and client.
// The reasons match the public.moderation_reason domain in the database.
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

// Shown under each choice in the report form.
export const reasonHints: Record<Reason, string> = {
  spam: "Unwanted promotion, repeated messages, or a listing that is not a real product.",
  misleading: "False claims about a product or a person.",
  impersonation: "Uses someone else's name, brand or work without permission.",
  harassment: "Threats, insults or hateful content aimed at a person or a group.",
  illegal: "Breaks the law, for example fraud or content that infringes someone's rights.",
  other: "Anything else that breaks the terms.",
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
// As the reporter reads it.
export const statusLabels: Record<ReportStatus, string> = {
  open: "Waiting for review",
  actioned: "Action taken",
  dismissed: "No action taken",
};
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

/** A short title for a report, from the copy stored with it. */
export function reportTitle(report: { target: string; content: unknown }) {
  const content = (report.content ?? {}) as Record<string, unknown>;
  if (report.target === "message")
    return typeof content.body === "string" ? `“${excerpt(content.body, 60)}”` : "A message";
  return typeof content.name === "string" && content.name ? content.name : "Unnamed";
}
