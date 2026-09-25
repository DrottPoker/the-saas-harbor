import { z } from "zod";

// Feedback from users to the admins. The database has the same kinds and limits
// (public.submit_feedback).
export const FEEDBACK_KINDS = ["bug", "suggestion", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const feedbackLabels: Record<FeedbackKind, string> = {
  bug: "Bug or error",
  suggestion: "Suggestion",
  other: "Other feedback",
};

export const feedbackHints: Record<FeedbackKind, string> = {
  bug: "Something does not work, or shows the wrong thing.",
  suggestion: "An idea for something new, or something to do better.",
  other: "Anything else you want to tell us.",
};

export const FEEDBACK_MIN_LENGTH = 10;
export const FEEDBACK_MAX_LENGTH = 2000;

export const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS, { error: "Choose what kind of feedback it is." }),
  message: z
    .string()
    .trim()
    .min(FEEDBACK_MIN_LENGTH, `Write at least ${FEEDBACK_MIN_LENGTH} characters.`)
    .max(FEEDBACK_MAX_LENGTH, "Keep it under 2,000 characters."),
});

/**
 * A path on this site that feedback was sent from, such as /dashboard, or null for anything else,
 * so the admin panel never links to another site.
 */
export function feedbackPage(value: string | null | undefined) {
  const page = (value ?? "").trim();
  return page.length <= 300 && /^\/([^/\\].*)?$/.test(page) ? page : null;
}

/** The feedback page, remembering the page it was opened from. */
export function feedbackHref(from: string | null) {
  const page = feedbackPage(from);
  return page && page !== "/feedback" ? `/feedback?from=${encodeURIComponent(page)}` : "/feedback";
}
