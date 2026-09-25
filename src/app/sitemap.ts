import type { MetadataRoute } from "next";
import { publicClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/seo";

// Listed products and the makers behind them, read like a visitor would, so hidden products and
// suspended makers never appear. Built per request, since products change all the time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/discover`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/newest`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
  const client = publicClient();
  if (!client) return pages;
  // The API returns at most 1,000 rows per request, so products are read a page at a time, up to
  // the 50,000 addresses one sitemap may hold.
  const data: { slug: string | null; owner_slug: string | null; updated_at: string | null }[] = [];
  for (let start = 0; start < 50_000; start += 1000) {
    const { data: page, error } = await client
      .from("public_saas")
      .select("slug, owner_slug, updated_at")
      .order("created_at")
      .order("id")
      .range(start, start + 999);
    if (error) throw new Error("The sitemap could not be built.");
    data.push(...page);
    if (page.length < 1000) break;
  }
  // A maker page is listed once, dated by their latest product change.
  const makers = new Map<string, string>();
  for (const row of data) {
    if (!row.owner_slug || !row.updated_at) continue;
    const seen = makers.get(row.owner_slug);
    if (!seen || seen < row.updated_at) makers.set(row.owner_slug, row.updated_at);
  }
  return [
    ...pages,
    ...data
      .filter((row) => row.slug)
      .map((row) => ({
        url: `${base}/saas/${row.slug}`,
        lastModified: row.updated_at ?? undefined,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
    ...[...makers].map(([slug, updated]) => ({
      url: `${base}/makers/${slug}`,
      lastModified: updated,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
