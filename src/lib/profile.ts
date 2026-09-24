// Personal profile data shared by the editor and the public profile. Pure functions only.
import type { Database } from "./supabase/database.types";

export type ProfileExperience = Database["public"]["Tables"]["profile_experience"]["Row"];

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2024-03" for the current month in UTC, comparable as text with other months. */
export function currentMonth(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "Mar 2024" for a stored date or a "YYYY-MM" month. */
export function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}

/** Whole months from the start month through the end month, both included, like LinkedIn. */
export function monthsBetween(start: string, end: string | null, now = new Date()) {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = (end ?? currentMonth(now)).split("-").map(Number);
  return Math.max(1, (endYear - startYear) * 12 + (endMonth - startMonth) + 1);
}

/** "2 yrs 3 mos", "1 yr", "8 mos", "1 mo". */
export function formatDuration(months: number) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [
    years && `${years} ${years === 1 ? "yr" : "yrs"}`,
    rest && `${rest} ${rest === 1 ? "mo" : "mos"}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** "Jan 2022 - Present · 2 yrs 9 mos". */
export function rolePeriod(
  role: Pick<ProfileExperience, "starts_on" | "ends_on">,
  now = new Date(),
) {
  const range = `${formatMonth(role.starts_on)} - ${role.ends_on ? formatMonth(role.ends_on) : "Present"}`;
  return `${range} · ${formatDuration(monthsBetween(role.starts_on, role.ends_on, now))}`;
}

/** Current roles first, then the most recently ended, then the most recently started. */
export function sortRoles<T extends Pick<ProfileExperience, "starts_on" | "ends_on">>(roles: T[]) {
  return [...roles].sort(
    (a, b) =>
      Number(a.ends_on !== null) - Number(b.ends_on !== null) ||
      (b.ends_on ?? "").localeCompare(a.ends_on ?? "") ||
      b.starts_on.localeCompare(a.starts_on),
  );
}

/** Skills typed as a list separated by commas or new lines, without duplicates. */
export function parseSkills(value: string) {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const raw of value.split(/[,\n]/)) {
    const skill = raw.trim().replace(/\s+/g, " ");
    if (!skill || seen.has(skill.toLowerCase())) continue;
    seen.add(skill.toLowerCase());
    skills.push(skill);
  }
  return skills;
}
