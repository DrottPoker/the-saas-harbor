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

/** The heading of the form, on the page and in the dialog. */
export const feedbackHeading = {
  title: "Send feedback",
  description: "Report a bug or an error, suggest something, or tell us what you think.",
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

/** Where a Feedback link on `path` leads: the form, or for a visitor, sign-in that continues there. */
export function feedbackLink(path: string, signedIn: boolean) {
  const href = feedbackHref(path);
  return signedIn ? href : `/auth?next=${encodeURIComponent(href)}`;
}

/**
 * How the form opens on a link inside the site, from the Next-Url of the navigation: in a dialog
 * over the page, as the full page after signing in on the full sign-in page, where a dialog would
 * sit over sign-in, or not at all over the full feedback page, which already shows the form.
 */
export function feedbackOpening(nextUrl: string | null): "dialog" | "page" | "none" {
  let pathname: string;
  try {
    pathname = new URL(nextUrl ?? "", "http://site.invalid").pathname;
  } catch {
    return "dialog";
  }
  if (pathname === "/feedback") return "none";
  return pathname === "/auth" || pathname.startsWith("/auth/") ? "page" : "dialog";
}
