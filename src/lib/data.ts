import "server-only";
import { cache } from "react";
import { publicClient } from "./supabase/server";
import { demoFill, demoListings, type DemoDetails } from "./demo";
import { categories, containsPattern } from "./domain";
import { parseStats } from "./stats";
import type { Database } from "./supabase/database.types";
export type Listing = Database["public"]["Views"]["public_saas"]["Row"] & {
  rank?: number | null;
  /** Only on the made-up products from src/lib/demo.ts, which are never stored or ranked. */
  demo?: DemoDetails;
};
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Saas = Database["public"]["Tables"]["saas"]["Row"];
export type SaasSettings = Database["public"]["Tables"]["saas_settings"]["Row"];
export type RevenueSnapshot = Database["public"]["Tables"]["revenue_snapshots"]["Row"];
/** How often a product's page was viewed, which only its founder reads. */
export type PageViewCounts =
  Database["public"]["Functions"]["saas_page_view_counts"]["Returns"][number];
export type RevenueConnection = Omit<
  Database["public"]["Tables"]["revenue_connections"]["Row"],
  "encrypted_key" | "last_checked_at"
>;
// Columns owners may read; the encrypted key is never granted.
export const CONNECTION_COLUMNS =
  "saas_id, owner_id, provider, key_hint, livemode, status, last_error, connected_at, last_synced_at";
export type RevenueStatus = "unverified" | "stale" | "private" | "verified";
export const PAGE_SIZE = 12;
/** PostgREST's answer to a page that starts past the last row. It means an empty page. */
export const PAST_LAST_PAGE = "PGRST103";
export type Sort = "rank" | "name" | "newest";
export async function listings({
  sort = "newest",
  category = "",
  search = "",
  page = 1,
  owner,
  tech,
  unranked = false,
}: {
  sort?: Sort;
  category?: string;
  search?: string;
  page?: number;
  owner?: string;
  /** Only products built with this technology (a slug from src/lib/tech.ts). */
  tech?: string;
  /** Only products that are not on the leaderboard. */
  unranked?: boolean;
} = {}) {
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
  if (tech) query = query.contains("tech_stack", [tech]);
  if (unranked) query = query.neq("revenue_status", "verified");
  query =
    sort === "rank"
      ? query.order("rank", { ascending: true })
      : sort === "name"
        ? query.order("name").order("id")
        : query.order("created_at", { ascending: false }).order("id");
  const start = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(start, start + PAGE_SIZE - 1);
  if (error?.code === PAST_LAST_PAGE) return { rows: [] as Listing[], count: 0, error: null };
  return {
    rows: (data ?? []) as Listing[],
    count: count ?? 0,
    error: error ? "Products could not be loaded. Please try again shortly." : null,
  };
}
/** The top of the leaderboard, for llms.txt. */
export async function topRanked(limit: number) {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client
    .from("leaderboard")
    .select("*")
    .order("rank", { ascending: true })
    .limit(limit);
  if (error) throw new Error("The leaderboard could not be loaded.");
  return data as Listing[];
}

/** Every listed product of a maker, newest first. An account lists at most 20. */
export async function makerListings(ownerId: string) {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client
    .from("public_saas")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(100);
  if (error) throw new Error("This user's products could not be loaded.");
  return data as Listing[];
}

/** The statistics page's figures, computed in the database from the leaderboard. */
export const directoryStats = cache(async () => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.rpc("directory_stats");
  if (error) throw new Error("The statistics could not be loaded.");
  return parseStats(data);
});

export type CategoryCount = { products: number; ranked: number };

/** Listed and ranked products per category. Categories without listed products are missing. */
export const categoryCounts = cache(async () => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.from("category_counts").select("*");
  if (error) throw new Error("Categories could not be loaded.");
  return new Map<string, CategoryCount>(
    data.flatMap((row) =>
      row.category
        ? [[row.category, { products: row.products ?? 0, ranked: row.ranked ?? 0 }]]
        : [],
    ),
  );
});

/** Listed and ranked products per technology slug. Technologies without products are missing. */
export const techCounts = cache(async () => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.from("tech_counts").select("*");
  if (error) throw new Error("Technologies could not be loaded.");
  return new Map<string, CategoryCount>(
    data.flatMap((row) =>
      row.tech ? [[row.tech, { products: row.products ?? 0, ranked: row.ranked ?? 0 }]] : [],
    ),
  );
});

/**
 * Whether the made-up demo products show (src/lib/demo.ts): until a full page of real products
 * shares verified MRR, and never with DEMO_PRODUCTS=off. When the count cannot be read, they stay
 * hidden.
 */
export const demoActive = cache(async () => {
  if (process.env.DEMO_PRODUCTS === "off") return false;
  const client = publicClient();
  if (!client) return false;
  const { count, error } = await client
    .from("leaderboard")
    .select("id", { count: "exact", head: true });
  return !error && count != null && count < PAGE_SIZE;
});
/** The demo products a list shows after the `count` real products that match its filters. */
export async function demoRows({
  count,
  ...options
}: {
  sort: Sort;
  category: string;
  search: string;
  page: number;
  count: number;
}) {
  const room = PAGE_SIZE - count;
  // A full or later page has no room, so it needs no count of the leaderboard either.
  if (options.page !== 1 || room <= 0 || !(await demoActive())) return [];
  return demoFill(demoListings(), { ...options, room });
}
/** A demo product for its page, while demo products show. */
export async function demoProduct(slug: string) {
  if (!(await demoActive())) return null;
  return demoListings().find((item) => item.slug === slug) ?? null;
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
  if (error) throw new Error("This profile could not be loaded.");
  return data;
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// What an address points to: the item to show, or the address to send the visitor to instead.
type Found<T> = { item: T } | { redirect: string } | null;

/**
 * A product by its address. The current slug shows the page. An id, an earlier slug or another
 * letter case redirects to the current slug.
 */
export const findSaas = cache(async (address: string): Promise<Found<Listing>> => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const slug = address.toLowerCase();
  if (SLUG.test(slug) && slug.length <= 64) {
    const { data, error } = await client
      .from("public_saas")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error("This SaaS profile could not be loaded.");
    if (data) return slug === address ? { item: data } : { redirect: `/saas/${data.slug}` };
    const { data: current, error: redirectError } = await client.rpc("saas_slug_redirect", {
      p_slug: slug,
    });
    if (redirectError) throw new Error("This SaaS profile could not be loaded.");
    if (current) return { redirect: `/saas/${current}` };
  }
  if (!UUID.test(address)) return null;
  const item = await publicSaas(address.toLowerCase());
  return item?.slug ? { redirect: `/saas/${item.slug}` } : null;
});

/** A maker by their address. An id or another letter case redirects to the current slug. */
export const findProfile = cache(async (address: string): Promise<Found<Profile>> => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const slug = address.toLowerCase();
  if (SLUG.test(slug) && slug.length <= 64) {
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error("This profile could not be loaded.");
    if (data) return slug === address ? { item: data } : { redirect: `/users/${data.slug}` };
  }
  if (!UUID.test(address)) return null;
  const profile = await publicProfile(address.toLowerCase());
  return profile ? { redirect: `/users/${profile.slug}` } : null;
});

export const publicProfileExperience = cache(async (id: string) => {
  const client = publicClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.from("profile_experience").select("*").eq("profile_id", id);
  if (error) throw new Error("This profile could not be loaded.");
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
  if (error) throw new Error("This profile could not be loaded.");
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
