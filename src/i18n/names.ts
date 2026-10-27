import { categories, categorySlug, type Category } from "@/lib/domain";

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
