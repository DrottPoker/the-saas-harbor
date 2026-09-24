"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatUsd, type ActionState } from "@/lib/domain";
import { parseRestrictedKey } from "@/lib/stripe/key";
import { connectStripe, disconnectStripe, syncStripeConnection } from "@/lib/stripe/sync";
import type { Verification } from "@/lib/stripe/sync";
import { requireUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// The SaaS id is bound on the client, so ownership is checked on every call.
async function requireOwnedSaas(saasId: string) {
  const { user, client } = await requireUser();
  const { data } = await client
    .from("saas")
    .select("id")
    .eq("id", saasId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!data) throw new Error("You can only manage Stripe for your own SaaS.");
  return client as SupabaseClient<Database>;
}

function summary(result: Verification) {
  const customers = `${result.customers} paying ${result.customers === 1 ? "customer" : "customers"}`;
  const skipped = result.skippedItems
    ? ` ${result.skippedItems} usage-based ${result.skippedItems === 1 ? "item was" : "items were"} not counted.`
    : "";
  const history = result.historyNote ? ` ${result.historyNote}` : "";
  return `Verified MRR: ${formatUsd(result.mrrCents)} from ${customers}.${skipped}${history}`;
}

const failure = (error: unknown): ActionState => ({
  error: error instanceof Error ? error.message : "Something went wrong. Please try again.",
});

export async function connectStripeAction(
  saasId: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await requireOwnedSaas(saasId);
    const key = parseRestrictedKey(String(form.get("stripe_key") ?? ""), {
      allowTest: process.env.STRIPE_ALLOW_TEST_KEYS === "true",
    });
    const result = await connectStripe(saasId, key);
    revalidatePath("/", "layout");
    return { success: `Stripe connected. ${summary(result)}` };
  } catch (error) {
    return failure(error);
  }
}

export async function refreshStripeAction(saasId: string): Promise<ActionState> {
  try {
    const client = await requireOwnedSaas(saasId);
    const { data } = await client
      .from("stripe_connections")
      .select("last_synced_at")
      .eq("saas_id", saasId)
      .maybeSingle();
    const last = data?.last_synced_at ? Date.parse(data.last_synced_at) : 0;
    if (Date.now() - last < REFRESH_INTERVAL_MS)
      return { error: "Revenue was verified in the last few minutes. Try again later." };
    const result = await syncStripeConnection(saasId);
    revalidatePath("/", "layout");
    return { success: summary(result) };
  } catch (error) {
    revalidatePath("/", "layout");
    return failure(error);
  }
}

export async function disconnectStripeAction(saasId: string): Promise<ActionState> {
  try {
    await requireOwnedSaas(saasId);
    await disconnectStripe(saasId);
    revalidatePath("/", "layout");
    return { success: "Stripe disconnected. The stored key was deleted." };
  } catch (error) {
    return failure(error);
  }
}
