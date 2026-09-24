import "server-only";
import { cache } from "react";
import { publicClient } from "./supabase/server";
import { categories, containsPattern } from "./domain";
import type { Database } from "./supabase/database.types";
export type Listing = Database["public"]["Views"]["public_saas"]["Row"] & { rank?: number | null };
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Saas = Database["public"]["Tables"]["saas"]["Row"];
export type Report = Database["public"]["Tables"]["metric_reports"]["Row"];
export const PAGE_SIZE = 12;
export type Sort = "rank" | "name" | "newest";
export async function listings({
  sort = "newest",
  category = "",
  search = "",
  page = 1,
  owner,
}: { sort?: Sort; category?: string; search?: string; page?: number; owner?: string } = {}) {
  const client = publicClient();
  if (!client)
    return {
      rows: [] as Listing[],
      count: 0,
      error: "Supabase is not configured. See the setup guide in README.md.",
    };
  let query = client
    .from(sort === "rank" ? "leaderboard" : "public_saas")
    .select("*", { count: "exact" });
  if (categories.includes(category as (typeof categories)[number]))
    query = query.eq("category", category);
  const pattern = containsPattern(search);
  if (pattern) query = query.ilike("name", pattern);
  if (owner) query = query.eq("owner_id", owner);
  query =
    sort === "rank"
      ? query.order("rank", { ascending: true })
      : sort === "name"
        ? query.order("name").order("id")
        : query.order("created_at", { ascending: false }).order("id");
  const start = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(start, start + PAGE_SIZE - 1);
  return {
    rows: (data ?? []) as Listing[],
    count: count ?? 0,
    error: error ? "Products could not be loaded. Please try again shortly." : null,
  };
}
// Cached per request so metadata and page rendering share one query.
export const publicSaas = cache(async (id: string) => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.from("public_saas").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("This SaaS profile could not be loaded.");
  return data;
});
export const publicProfile = cache(async (id: string) => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("This maker could not be loaded.");
  return data;
});
export function safePage(value: string | undefined) {
  return Math.min(10000, Math.max(1, Number.parseInt(value || "1", 10) || 1));
}
