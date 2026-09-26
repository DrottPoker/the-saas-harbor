import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { currentUser, serverClient } from "./supabase/server";
import type { Database } from "./supabase/database.types";

export type Report = Database["public"]["Tables"]["reports"]["Row"];
export type LogEntry = Database["public"]["Tables"]["moderation_log"]["Row"];
export type AdminClient = Awaited<ReturnType<typeof serverClient>>;

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

export const ADMIN_PAGE_SIZE = 25;

// Where a decision form returns to: an admin detail page only.
export function safeAdminPath(value: string) {
  return /^\/admin\/(reports|products|accounts)\/[0-9a-f-]{36}$/.test(value) ? value : null;
}
