import type { NextRequest } from "next/server";
import { badgeSvg, badgeTheme } from "@/lib/badge";
import { findSaas } from "@/lib/data";

// The badge makers embed on their own sites. The proxy leaves this path alone, so the response
// sets its own headers: other sites may load it, caches may keep it for ten minutes, and it is
// read as a picture, never as a document that runs anything.
const HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=600",
  "Content-Security-Policy": "default-src 'none'",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Robots-Tag": "noindex",
};

export async function GET(request: NextRequest, ctx: RouteContext<"/saas/[slug]/badge.svg">) {
  const found = await findSaas((await ctx.params).slug);
  // Unknown and hidden products have no badge, and a renamed product's badge follows it.
  if (!found)
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if ("redirect" in found)
    return new Response(null, {
      status: 308,
      headers: {
        Location: `${found.redirect}/badge.svg${request.nextUrl.search}`,
        "Cache-Control": "no-store",
      },
    });
  const { revenue_status, mrr_cents } = found.item;
  const svg = badgeSvg({
    mrrCents: revenue_status === "verified" ? mrr_cents : null,
    theme: badgeTheme(request.nextUrl.searchParams.get("theme")),
  });
  return new Response(svg, { headers: HEADERS });
}
