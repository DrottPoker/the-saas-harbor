import { z } from "zod";

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
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(400),
  website: optionalUrl,
  social_url: optionalUrl,
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
