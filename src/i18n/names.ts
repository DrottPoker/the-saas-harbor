import { categories, categorySlug, type Category } from "@/lib/domain";
import type { TechGroup } from "@/lib/tech";

/** A category's message key in the categories namespace, such as names.developer-tools. */
export type CategoryKey = `names.${ReturnType<typeof categoryKeyOf>}`;

function categoryKeyOf(category: Category) {
  return categorySlug(category) as
    | "ai-machine-learning"
    | "developer-tools"
    | "productivity"
    | "marketing"
    | "design"
    | "finance"
    | "analytics"
    | "other";
}

/** The message key of a stored category name; Other for one the site no longer has. */
export function categoryKey(category: string | null | undefined): CategoryKey {
  const known = categories.find((name) => name === category);
  return `names.${known ? categoryKeyOf(known) : "other"}`;
}

const TECH_GROUP_KEYS = {
  Frontend: "frontend",
  "Mobile and desktop": "mobileAndDesktop",
  "No-code": "noCode",
  Backend: "backend",
  Databases: "databases",
  "Hosting and infrastructure": "hosting",
  Payments: "payments",
  AI: "ai",
  Services: "services",
} as const satisfies Record<TechGroup, string>;

/** A technology group's message key in the tech namespace, such as groups.backend. */
export function techGroupKey(group: TechGroup) {
  return `groups.${TECH_GROUP_KEYS[group]}` as const;
}
