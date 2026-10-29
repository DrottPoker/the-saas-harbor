import { z } from "zod";
import { splitLocale } from "@/i18n/config";
import type en from "@/messages/en";
import { hasUnsafeUrlCharacters } from "./domain";
import { invalid } from "./validation";

// Feedback from users and visitors to the admins. The database has the same kinds and limits
// (public.submit_feedback and public.submit_visitor_feedback).
export const FEEDBACK_KINDS = ["bug", "suggestion", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** The kinds in English, for the admin panel. The form takes its own from feedback.kinds. */
export const feedbackLabels: Record<FeedbackKind, string> = {
  bug: "Bug or error",
  suggestion: "Suggestion",
  other: "Other feedback",
};

export const FEEDBACK_MIN_LENGTH = 10;
export const FEEDBACK_MAX_LENGTH = 2000;

/**
 * The errors submit_feedback() and submit_visitor_feedback() raise (P0001), as keys in
 * feedback.errors, so they read in the page's language. `tooShort` takes `min`, `tooLong` `max`.
 */
export const FEEDBACK_ERRORS = new Map<string, keyof (typeof en)["feedback"]["errors"]>([
  ["Choose what kind of feedback it is", "chooseKind"],
  ["Write at least 10 characters", "tooShort"],
  ["Keep it under 2,000 characters", "tooLong"],
  ["Enter a valid email address, or leave it empty", "email"],
  ["Your account is suspended, so you cannot send feedback", "suspended"],
  ["You have sent a lot of feedback. Try again later", "tooMuch"],
  ["A lot of feedback came in just now. Try again later", "busy"],
]);

export const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS, { error: invalid("feedback.kind") }),
  message: z
    .string()
    .trim()
    .min(FEEDBACK_MIN_LENGTH, invalid("feedback.min", { min: FEEDBACK_MIN_LENGTH }))
    .max(FEEDBACK_MAX_LENGTH, invalid("feedback.max")),
  /** Where a visitor wants a reply, if anywhere. A user's address is in their account. */
  email: z
    .string()
    .trim()
    .max(254, invalid("feedback.email"))
    .refine((value) => !value || z.email().safeParse(value).success, invalid("feedback.email"))
    .default(""),
});

/** A form field people never see, which only bots fill in. */
export const FEEDBACK_TRAP = "homepage";

/**
 * A path on this site that feedback was sent from, such as /dashboard, or null for anything else,
 * so the admin panel never links to another site. Browsers drop tabs and line breaks from an
 * address, so a path holding them, spaces or backslashes is refused too: /<tab>/x.example would
 * lead to x.example.
 */
export function feedbackPage(value: string | null | undefined) {
  const page = (value ?? "").trim();
  return page.length <= 300 && /^\/([^/\\].*)?$/.test(page) && !hasUnsafeUrlCharacters(page)
    ? page
    : null;
}

/** The feedback page, remembering the page it was opened from. */
export function feedbackHref(from: string | null) {
  const page = feedbackPage(from);
  return page && page !== "/feedback" ? `/feedback?from=${encodeURIComponent(page)}` : "/feedback";
}

/**
 * How the form opens on a link inside the site, from the Next-Url of the navigation: in a dialog
 * over the page, as the full page after signing in on the full sign-in page, where a dialog would
 * sit over sign-in, or not at all over the full feedback page, which already shows the form. The
 * same holds in every language (/es/auth).
 */
export function feedbackOpening(nextUrl: string | null): "dialog" | "page" | "none" {
  let pathname: string;
  try {
    pathname = splitLocale(new URL(nextUrl ?? "", "http://site.invalid").pathname).path;
  } catch {
    return "dialog";
  }
  if (pathname === "/feedback") return "none";
  return pathname === "/auth" || pathname.startsWith("/auth/") ? "page" : "dialog";
}
