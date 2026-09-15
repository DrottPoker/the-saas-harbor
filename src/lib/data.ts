import "server-only";
import { publicClient } from "./supabase/server";
import { categories } from "./domain";
import type { Database } from "./supabase/database.types";
export type Listing = Database["public"]["Views"]["public_saas"]["Row"] & { rank?: number | null };
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Saas = Database["public"]["Tables"]["saas"]["Row"];
export type Report = Database["public"]["Tables"]["metric_reports"]["Row"];
export const PAGE_SIZE = 12;
export async function listings({ ranked = false, category = "", search = "", page = 1, owner }: { ranked?: boolean; category?: string; search?: string; page?: number; owner?: string } = {}) {
  const client = publicClient();
  if (!client) return { rows: [] as Listing[], count: 0, error: "Connect Supabase to open the harbor. See the setup guide in README.md." };
  let query = client.from(ranked ? "leaderboard" : "public_saas").select("*", { count: "exact" });
  if (categories.includes(category as typeof categories[number])) query = query.eq("category", category);
  if (search.trim()) query = query.ilike("name", `%${search.trim().slice(0, 80).replace(/[%_\\]/g, "")}%`);
  if (owner) query = query.eq("owner_id", owner);
  query = ranked ? query.order("rank", { ascending: true }) : query.order("created_at", { ascending: false }).order("id");
  const start = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(start, start + PAGE_SIZE - 1);
  return { rows: (data ?? []) as Listing[], count: count ?? 0, error: error ? "The harbor could not be loaded. Please try again shortly." : null };
}
export function safePage(value: string | undefined) { return Math.min(10000, Math.max(1, Number.parseInt(value || "1", 10) || 1)); }
