import { z } from "zod";
import { DETAILS_MAX_LENGTH, DETAILS_REQUIRED, NOTE_MAX_LENGTH, REASONS } from "./moderation";
import { TECH_STACK_MAX, techFromSlug } from "./tech";

export const categories = [
  "AI & Machine Learning",
  "Developer Tools",
  "Productivity",
  "Marketing",
  "Design",
  "Finance",
  "Analytics",
  "Other",
] as const;
export type Category = (typeof categories)[number];
/** The address of a category page: "AI & Machine Learning" is /categories/ai-machine-learning. */
export function categorySlug(category: string) {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export function categoryFromSlug(slug: string): Category | null {
  return categories.find((category) => categorySlug(category) === slug) ?? null;
}
// PostgREST treats * like %, so every wildcard character is removed from user input.
export function searchTerm(search: string) {
  return search
    .trim()
    .slice(0, 80)
    .replace(/[%_*\\]/g, "");
}
export function containsPattern(search: string) {
  const term = searchTerm(search);
  return term ? `%${term}%` : null;
}
export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
export function formatDate(value: string | null) {
  if (!value) return "Not shared";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
/**
 * Whether an address or path holds spaces, control characters or backslashes. A valid one never
 * needs them, and browsers read them differently from other parsers: a backslash ends the host,
 * and tabs and line breaks are dropped.
 */
export function hasUnsafeUrlCharacters(value: string) {
  return (
    /[\s\\]/.test(value) ||
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || (code >= 127 && code < 160);
    })
  );
}
/** An address as typed, with https:// in front when it names no scheme, such as example.com. */
export function withScheme(value: string) {
  const trimmed = value.trim();
  return !trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
// An address field: trimmed, with https:// added when it has no scheme.
const address = z.string().transform(withScheme).pipe(z.string().max(500));
const optionalUrl = address.refine(
  (value) =>
    !value ||
    (!hasUnsafeUrlCharacters(value) &&
      (() => {
        try {
          const url = new URL(value);
          return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
        } catch {
          return false;
        }
      })()),
  "Enter a web address, such as example.com, without spaces.",
);
// A link to a profile on one site, such as LinkedIn: https, the right host and a path.
function profileLink(host: RegExp, site: string, example: string) {
  return address.refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        host.test(url.hostname) &&
        url.pathname.length > 1 &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, `Use your ${site} address, such as ${example}.`);
}
/**
 * The latest date anywhere, in the time zone furthest ahead (UTC+14): what "today" is for a founder
 * east of UTC is never in the future by it.
 */
export function latestDate(now = new Date()) {
  return new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10);
}
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use a name of 2 to 60 characters.")
    .max(60, "Use a name of 2 to 60 characters."),
  headline: z.string().trim().max(120, "Keep the headline under 120 characters."),
  location: z.string().trim().max(80, "Keep the location under 80 characters."),
  website: optionalUrl,
  linkedin_url: profileLink(
    /^([a-z0-9-]+\.)*linkedin\.com$/i,
    "LinkedIn",
    "https://www.linkedin.com/in/your-name",
  ),
  github_url: profileLink(/^(www\.)?github\.com$/i, "GitHub", "https://github.com/your-name"),
  x_url: profileLink(/^(www\.)?(x|twitter)\.com$/i, "X", "https://x.com/your-name"),
  social_url: optionalUrl,
});
export const saasSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().min(5).max(140),
  description: z.string().trim().min(20).max(5000),
  category: z.enum(categories, { message: "Choose a category." }),
  website: optionalUrl.refine(Boolean, "A website is required."),
  launched_on: z
    .string()
    .refine(
      (v) =>
        !v ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v),
      "Enter a valid date.",
    )
    .refine(
      (v) => !v || (v >= "1970-01-01" && v <= latestDate()),
      "Enter a launch date between 1970 and today.",
    ),
  /** MRR and revenue from payments are shared or hidden together. */
  share_revenue: z.boolean(),
  share_customers: z.boolean(),
  share_launch: z.boolean(),
  tech_stack: z
    .array(z.string())
    .max(TECH_STACK_MAX, `Choose up to ${TECH_STACK_MAX} technologies.`)
    .refine(
      (stack) => stack.every((slug) => techFromSlug(slug)) && new Set(stack).size === stack.length,
      "Choose technologies from the list.",
    ),
});
export type ActionState = { error?: string; success?: string };

/**
 * A username is the profile's slug: shown as @username and used in /users/<username>. The
 * database checks the same rules (private.username_problem) and which names are reserved.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_RULES = "Use 3 to 30 letters, numbers and single hyphens, like jane-doe.";
export const usernameSchema = z
  .string()
  .trim()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH, USERNAME_RULES)
      .max(USERNAME_MAX_LENGTH, USERNAME_RULES)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, USERNAME_RULES),
  );
export const USERNAME_PROBLEMS = {
  format: USERNAME_RULES,
  reserved: "That username is reserved. Choose another one.",
  taken: "That username is taken. Choose another one.",
} as const;
export type UsernameProblem = keyof typeof USERNAME_PROBLEMS;

/** Days between username changes, as in public.set_username. The first change is free. */
export const USERNAME_CHANGE_DAYS = 30;

/** A username as the user typed it, in the form it is stored in, before the rules are checked. */
export function normalizeUsername(input: string) {
  return usernameAsTyped(input.trim().replace(/^@/, ""));
}

/** What the username field shows while typing: lowercase, with spaces and underscores as hyphens. */
export function usernameAsTyped(input: string) {
  return input.toLowerCase().replace(/[\s_]+/g, "-");
}

/** When the username can be changed again, in days from now, such as "in 12 days". */
export function usernameLockedMessage(availableAt: string, now = Date.now()) {
  const days = Math.max(1, Math.ceil((new Date(availableAt).getTime() - now) / 86_400_000));
  return `You can change your username again in ${days} ${days === 1 ? "day" : "days"}.`;
}

/** Password length for new passwords, also set in Supabase Auth (supabase/config.toml). */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

export const MESSAGE_MAX_LENGTH = 4000;

const reason = z.enum(REASONS, { message: "Choose a reason." });
export const reportSchema = z
  .object({
    reason,
    details: z.string().trim().max(DETAILS_MAX_LENGTH, "Keep the details under 1,000 characters."),
  })
  .refine((report) => !DETAILS_REQUIRED.includes(report.reason) || report.details.length > 0, {
    message: "Describe the problem so it can be reviewed.",
    path: ["details"],
  });
// An admin's decision. The explanation is shown to the maker.
export const decisionSchema = z.object({
  reason,
  note: z
    .string()
    .trim()
    .min(1, "Explain the decision. The user sees this explanation.")
    .max(NOTE_MAX_LENGTH, "Keep the explanation under 1,000 characters."),
});
export const noteSchema = z
  .string()
  .trim()
  .max(NOTE_MAX_LENGTH, "Keep the note under 1,000 characters.");

// An email link from Auth: a token hash and what it confirms. Only the kinds the app sends.
export function emailLink(tokenHash: string | null | undefined, type: string | null | undefined) {
  if (!tokenHash || !/^[A-Za-z0-9_-]{16,200}$/.test(tokenHash)) return null;
  if (type !== "email" && type !== "recovery" && type !== "email_change") return null;
  return { tokenHash, type } as const;
}
export type EmailLinkType = NonNullable<ReturnType<typeof emailLink>>["type"];

// Where sign-in may continue to. Only known internal paths, so the parameter cannot be used to
// send people to another site.
export function safeNext(value: string | null | undefined) {
  return value &&
    // The feedback page's from is an encoded path on this site (feedbackHref in feedback.ts).
    /^\/(messages(\/[0-9a-f-]{36})?|report\/(saas|profile|message)\/[0-9a-f-]{36}|feedback(\?from=%2F[A-Za-z0-9%._~-]*)?)$/.test(
      value,
    )
    ? value
    : null;
}
