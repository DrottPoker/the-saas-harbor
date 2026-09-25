import { z } from "zod";
import { DETAILS_MAX_LENGTH, DETAILS_REQUIRED, NOTE_MAX_LENGTH, REASONS } from "./moderation";
import { latestDate, latestMonth } from "./profile";

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
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      !value ||
      (() => {
        try {
          const url = new URL(value);
          return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
        } catch {
          return false;
        }
      })(),
    "Use a full http:// or https:// URL without credentials.",
  );
// A link to a profile on one site, such as LinkedIn: https, the right host and a path.
function profileLink(host: RegExp, site: string, example: string) {
  return z
    .string()
    .trim()
    .max(500)
    .refine((value) => {
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
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month and a year for every date.");
export const roleSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Every role needs a title.")
      .max(100, "Keep titles under 100 characters."),
    organization: z
      .string()
      .trim()
      .min(1, "Every role needs a company.")
      .max(100, "Keep company names under 100 characters."),
    start: month,
    end: month.nullable(),
    description: z.string().trim().max(1000, "Keep descriptions under 1,000 characters."),
  })
  .refine((role) => role.start >= "1900-01", "Choose a start year after 1900.")
  .refine((role) => role.start <= latestMonth(), "A start date cannot be in the future.")
  .refine((role) => !role.end || role.end >= role.start, "A role cannot end before it starts.")
  .refine((role) => !role.end || role.end <= latestMonth(), "An end date cannot be in the future.");
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use a name of 2 to 60 characters.")
    .max(60, "Use a name of 2 to 60 characters."),
  headline: z.string().trim().max(120, "Keep the headline under 120 characters."),
  location: z.string().trim().max(80, "Keep the location under 80 characters."),
  bio: z.string().trim().max(2000, "Keep About under 2,000 characters."),
  website: optionalUrl,
  linkedin_url: profileLink(
    /^([a-z0-9-]+\.)*linkedin\.com$/i,
    "LinkedIn",
    "https://www.linkedin.com/in/your-name",
  ),
  github_url: profileLink(/^(www\.)?github\.com$/i, "GitHub", "https://github.com/your-name"),
  x_url: profileLink(/^(www\.)?(x|twitter)\.com$/i, "X", "https://x.com/your-name"),
  social_url: optionalUrl,
  skills: z
    .array(
      z
        .string()
        .max(40, "Keep each skill under 40 characters.")
        .regex(/^\P{Cc}+$/u, "Skills cannot contain special characters."),
    )
    .max(20, "Add up to 20 skills."),
  experience: z.array(roleSchema).max(40, "List up to 40 roles."),
});
export const saasSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().min(5).max(140),
  description: z.string().trim().min(20).max(5000),
  category: z.enum(categories),
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
  share_mrr: z.boolean(),
  share_customers: z.boolean(),
  share_launch: z.boolean(),
});
export type ActionState = { error?: string; success?: string };

/**
 * A username is the profile's slug: shown as @username and used in /users/<username>. The
 * database checks the same rules (private.username_problem) and which names are reserved.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
const USERNAME_RULES = "Use 3 to 30 letters, numbers and single hyphens, like jane-doe.";
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
  return input.trim().replace(/^@/, "").toLowerCase();
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

// An email link from Auth: a token hash and what it confirms. Only the two kinds the app sends.
export function emailLink(tokenHash: string | null | undefined, type: string | null | undefined) {
  if (!tokenHash || !/^[A-Za-z0-9_-]{16,200}$/.test(tokenHash)) return null;
  if (type !== "email" && type !== "recovery") return null;
  return { tokenHash, type } as const;
}

// Where sign-in may continue to. Only known internal paths, so the parameter cannot be used to
// send people to another site.
export function safeNext(value: string | null | undefined) {
  return value &&
    /^\/(messages(\/[0-9a-f-]{36})?|report\/(saas|profile|message)\/[0-9a-f-]{36})$/.test(value)
    ? value
    : null;
}
