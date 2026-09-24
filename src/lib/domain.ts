import { z } from "zod";
import { currentMonth, ENTRY_KINDS, OPEN_TO_VALUES } from "./profile";

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
// PostgREST treats * like %, so every wildcard character is removed from user input.
export function containsPattern(search: string) {
  const term = search
    .trim()
    .slice(0, 80)
    .replace(/[%_*\\]/g, "");
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
export const entrySchema = z
  .object({
    kind: z.enum(ENTRY_KINDS),
    title: z
      .string()
      .trim()
      .min(1, "Every entry needs a title.")
      .max(100, "Keep titles under 100 characters."),
    organization: z
      .string()
      .trim()
      .min(1, "Every entry needs a company or school.")
      .max(100, "Keep company and school names under 100 characters."),
    start: month,
    end: month.nullable(),
    description: z.string().trim().max(1000, "Keep descriptions under 1,000 characters."),
  })
  .refine((entry) => entry.start >= "1900-01", "Choose a start year after 1900.")
  .refine((entry) => entry.start <= currentMonth(), "A start date cannot be in the future.")
  .refine(
    (entry) => !entry.end || entry.end >= entry.start,
    "An entry cannot end before it starts.",
  )
  .refine((entry) => !entry.end || entry.end <= "2100-12", "Choose an end year before 2100.");
export type EntryInput = z.infer<typeof entrySchema>;
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
  open_to: z.array(z.enum(OPEN_TO_VALUES)).transform((values) => [...new Set(values)]),
  skills: z
    .array(
      z
        .string()
        .max(40, "Keep each skill under 40 characters.")
        .regex(/^\P{Cc}+$/u, "Skills cannot contain special characters."),
    )
    .max(20, "Add up to 20 skills."),
  entries: z.array(entrySchema).max(40, "List up to 40 entries."),
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
    ),
  share_mrr: z.boolean(),
  share_customers: z.boolean(),
  share_launch: z.boolean(),
});
export type ActionState = { error?: string; success?: string };

export const MESSAGE_MAX_LENGTH = 4000;

// Where sign-in may continue to. Only known internal paths, so the parameter cannot be used to
// send people to another site.
export function safeNext(value: string | null | undefined) {
  return value && /^\/messages(\/[0-9a-f-]{36})?$/.test(value) ? value : null;
}
