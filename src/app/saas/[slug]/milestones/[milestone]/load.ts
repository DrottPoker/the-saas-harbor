import "server-only";
import { findSaas, publicMilestone, type Listing } from "@/lib/data";
import { parseMilestone, type Milestone } from "@/lib/milestones";

export type Params = Promise<{ slug: string; milestone: string }>;

/**
 * A milestone page's product and milestone. `redirect` moves an id or an earlier slug to the
 * current address, and a milestone visitors may not see (not reached, or MRR not verified and
 * shared) to the product page. Null is an unknown product or milestone.
 */
export async function loadMilestone(
  params: Params,
): Promise<
  | { item: Listing; milestone: Milestone; key: string; reachedAt: string }
  | { redirect: string }
  | null
> {
  const { slug, milestone: key } = await params;
  const milestone = parseMilestone(key);
  if (!milestone) return null;
  const found = await findSaas(slug);
  if (!found) return null;
  if ("redirect" in found) return { redirect: `${found.redirect}/milestones/${key}` };
  const { item } = found;
  const reachedAt = item.id ? await publicMilestone(item.id, key) : null;
  if (!reachedAt || item.revenue_status !== "verified") return { redirect: `/saas/${item.slug}` };
  return { item, milestone, key, reachedAt };
}
