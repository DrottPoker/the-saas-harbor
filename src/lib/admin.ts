import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { RevenueColumn } from "./revenue-figures";
import type { AccountPreferences } from "./account-preference-labels";
import { currentUser, serverClient } from "./supabase/server";
import type { Database } from "./supabase/database.types";

export type Report = Database["public"]["Tables"]["reports"]["Row"];
export type LogEntry = Database["public"]["Tables"]["moderation_log"]["Row"];
export type AdminClient = Awaited<ReturnType<typeof serverClient>>;

type RevenueRow = Database["public"]["Functions"]["admin_revenue"]["Returns"][number];
type Figure = "verified_at" | "mrr_cents" | RevenueColumn;
/**
 * A connected product's latest verified figures, private ones included. Generated types call
 * every returned column non-null; the figures are null until they have been read.
 */
export type AdminRevenue = Omit<RevenueRow, Figure> & { [K in Figure]: RevenueRow[K] | null };

// Whether the signed-in user is an admin, once per request. The database decides.
export const isAdmin = cache(async () => !!(await currentUser()) && (await sessionIsAdmin()));

/**
 * Whether the session's user is an admin, for Route Handlers that have looked up the user
 * already: React's cache only lasts a render, so isAdmin() would look them up again there.
 */
export async function sessionIsAdmin() {
  const client = await serverClient();
  const { data, error } = await client.rpc("is_admin");
  return !error && data === true;
}

/** The admin's session for Server Actions, or null for everyone else. */
export async function adminSession() {
  const user = await currentUser();
  if (!user || !(await isAdmin())) return null;
  return { user, client: await serverClient() };
}

/**
 * For every admin page: anyone who is not an admin gets a 404, so the panel is not advertised.
 * The database checks admin rights again on every read and decision.
 */
export async function requireAdmin() {
  const session = await adminSession();
  if (!session) notFound();
  return session;
}

/** Preferences are private account data, read through an admin-checked function. */
export async function adminAccountPreferences(client: AdminClient, ids: string[]) {
  const preferences = new Map<string, AccountPreferences>();
  if (!ids.length) return preferences;
  const { data, error } = await client.rpc("admin_account_preferences", { p_ids: ids });
  if (error) throw new Error("Account preferences could not be loaded.");
  for (const entry of data) preferences.set(entry.id, entry);
  return preferences;
}

/** Maker names by account id. Accounts without a maker profile are missing from the map. */
export async function profileNames(client: AdminClient, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map<string, string>();
  const { data, error } = await client.from("profiles").select("id, name").in("id", unique);
  if (error) throw new Error("Names could not be loaded.");
  return new Map(data.map((row) => [row.id, row.name]));
}

/** How many open reports concern each product or maker. */
export async function openReportCounts(
  client: AdminClient,
  column: "saas_id" | "subject_id",
  ids: string[],
) {
  const counts = new Map<string, number>();
  if (!ids.length) return counts;
  const { data, error } = await client
    .from("reports")
    .select("saas_id, subject_id")
    .eq("status", "open")
    .in(column, ids);
  if (error) throw new Error("Reports could not be loaded.");
  for (const row of data) {
    const id = row[column];
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** The latest verified figures by product id. Products without a connection are missing. */
export async function adminRevenue(client: AdminClient, ids: string[]) {
  const figures = new Map<string, AdminRevenue>();
  if (!ids.length) return figures;
  const { data, error } = await client.rpc("admin_revenue", { p_ids: ids });
  if (error) throw new Error("Revenue could not be loaded.");
  for (const row of data) figures.set(row.saas_id, row);
  return figures;
}

/** What founders wrote under Other, by product id, for products that are not connected. */
export async function adminOtherProviders(client: AdminClient, ids: string[]) {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data, error } = await client.rpc("admin_other_providers", { p_ids: ids });
  if (error) throw new Error("Payment providers could not be loaded.");
  for (const row of data) names.set(row.saas_id, row.name);
  return names;
}

export type ProviderCount = { name: string; products: number };

/**
 * Which payment providers products use: the ones they are connected to, the names founders wrote
 * under Other, most products first, and how many products have neither.
 */
export async function adminPaymentProviders(client: AdminClient) {
  const { data, error } = await client.rpc("admin_payment_providers");
  if (error) throw new Error("Payment providers could not be loaded.");
  const rows = (kind: string): ProviderCount[] =>
    data.filter((row) => row.kind === kind && row.name !== null);
  return {
    connected: rows("connected"),
    other: rows("other"),
    none: data.find((row) => row.kind === "none")?.products ?? 0,
  };
}

export const ADMIN_PAGE_SIZE = 25;

// Where a decision form returns to: an admin detail page only.
export function safeAdminPath(value: string) {
  return /^\/admin\/(reports|products|accounts)\/[0-9a-f-]{36}$/.test(value) ? value : null;
}
