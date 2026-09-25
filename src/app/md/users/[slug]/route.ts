import { findProfile, makerListings, makerTotals, publicProfileExperience } from "@/lib/data";
import { makerMarkdown } from "@/lib/markdown";
import { siteUrl } from "@/lib/seo";
import { textNotFound, textRedirect, textResponse } from "@/lib/text-response";

// /makers/<slug>.md, which the proxy rewrites here: the maker page as Markdown.
export async function GET(_request: Request, ctx: RouteContext<"/md/users/[slug]">) {
  const found = await findProfile((await ctx.params).slug);
  if (!found) return textNotFound();
  if ("redirect" in found) return textRedirect(found.redirect);
  const profile = found.item;
  const [products, experience, totals] = await Promise.all([
    makerListings(profile.id),
    publicProfileExperience(profile.id),
    makerTotals(profile.id),
  ]);
  return textResponse(
    makerMarkdown(profile, products, experience, {
      mrr: totals.mrr.total,
      customers: totals.customers.total,
    }),
    { type: "text/markdown", canonical: `${siteUrl()}/users/${profile.slug}` },
  );
}
