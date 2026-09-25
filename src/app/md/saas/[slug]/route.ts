import { findSaas } from "@/lib/data";
import { productMarkdown } from "@/lib/markdown";
import { siteUrl } from "@/lib/seo";
import { textNotFound, textRedirect, textResponse } from "@/lib/text-response";

// /saas/<slug>.md, which the proxy rewrites here: the product page as Markdown.
export async function GET(_request: Request, ctx: RouteContext<"/md/saas/[slug]">) {
  const found = await findSaas((await ctx.params).slug);
  if (!found) return textNotFound();
  if ("redirect" in found) return textRedirect(found.redirect);
  return textResponse(productMarkdown(found.item), {
    type: "text/markdown",
    canonical: `${siteUrl()}/saas/${found.item.slug}`,
  });
}
