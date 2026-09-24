import "server-only";
import { cache } from "react";
import { publicClient } from "./supabase/server";
import { categories, containsPattern } from "./domain";
import type { Database } from "./supabase/database.types";
export type Listing = Database["public"]["Views"]["public_saas"]["Row"] & { rank?: number | null };
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Saas = Database["public"]["Tables"]["saas"]["Row"];
export type SaasSettings = Database["public"]["Tables"]["saas_settings"]["Row"];
export type RevenueSnapshot = Database["public"]["Tables"]["revenue_snapshots"]["Row"];
export type StripeConnection = Omit<
  Database["public"]["Tables"]["stripe_connections"]["Row"],
  "encrypted_key"
>;
// Columns owners may read; the encrypted key is never granted.
export const STRIPE_CONNECTION_COLUMNS =
  "saas_id, owner_id, key_hint, livemode, status, last_error, connected_at, last_synced_at";
export type RevenueStatus = "unverified" | "stale" | "private" | "verified";
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
export const publicProfileExperience = cache(async (id: string) => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.from("profile_experience").select("*").eq("profile_id", id);
  if (error) throw new Error("This maker could not be loaded.");
  return data;
});
// A maker's key figures: every listed product, and verified MRR and paying customers summed over
// the products that share them.
export const makerTotals = cache(async (id: string) => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client
    .from("public_saas")
    .select("mrr_cents, customers")
    .eq("owner_id", id);
  if (error) throw new Error("This maker could not be loaded.");
  const sum = (values: (number | null)[]) => {
    const shared = values.filter((value): value is number => value !== null);
    return {
      total: shared.length ? shared.reduce((a, b) => a + b, 0) : null,
      count: shared.length,
    };
  };
  return {
    products: data.length,
    mrr: sum(data.map((row) => row.mrr_cents)),
    customers: sum(data.map((row) => row.customers)),
  };
});
export function safePage(value: string | undefined) {
  return Math.min(10000, Math.max(1, Number.parseInt(value || "1", 10) || 1));
}
