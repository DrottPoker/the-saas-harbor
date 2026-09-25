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
  const { data, error } = await client
    .from("public_saas")
    .select("slug, owner_slug, updated_at")
    .order("created_at")
    .limit(50000);
  if (error) throw new Error("The sitemap could not be built.");
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
