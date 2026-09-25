"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatUsd, type ActionState } from "@/lib/domain";
import { makerMessage, VerificationError } from "@/lib/stripe/errors";
import { parseRestrictedKey } from "@/lib/stripe/key";
import { connectStripe, disconnectStripe, syncStripeConnection } from "@/lib/stripe/sync";
import type { Verification } from "@/lib/stripe/sync";
import { requireUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

// The SaaS id is bound on the client, so ownership is checked on every call.
async function requireOwnedSaas(saasId: string) {
  const { user, client } = await requireUser();
  const { data } = await client
    .from("saas")
    .select("id")
    .eq("id", saasId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!data) throw new VerificationError("You can only manage Stripe for your own SaaS.");
  return client as SupabaseClient<Database>;
}

// Every check, successful or not, counts against the limits in begin_stripe_check: a refresh at
// most every five minutes per product, and 20 checks an hour per maker.
async function beginCheck(client: SupabaseClient<Database>, saasId: string, refresh: boolean) {
  const { error } = await client.rpc("begin_stripe_check", { p_saas: saasId, p_refresh: refresh });
  if (error?.code === "P0001") throw new VerificationError(`${error.message}.`);
  if (error) throw new Error(`The Stripe check could not start: ${error.message}`);
}

function summary(result: Verification) {
  const customers = `${result.customers} paying ${result.customers === 1 ? "customer" : "customers"}`;
  const skipped = result.skippedItems
    ? ` ${result.skippedItems} usage-based ${result.skippedItems === 1 ? "item was" : "items were"} not counted.`
    : "";
  const history = result.historyNote ? ` ${result.historyNote}` : "";
  return `Verified MRR: ${formatUsd(result.mrrCents)} from ${customers}.${skipped}${history}`;
}

// Redirects, such as to sign-in, pass through; failures show only words written for makers.
function failure(error: unknown): ActionState {
  unstable_rethrow(error);
  return { error: makerMessage(error) };
}

export async function connectStripeAction(
  saasId: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const client = await requireOwnedSaas(saasId);
    const key = parseRestrictedKey(String(form.get("stripe_key") ?? ""), {
      allowTest: process.env.STRIPE_ALLOW_TEST_KEYS === "true",
    });
    await beginCheck(client, saasId, false);
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
    await beginCheck(client, saasId, true);
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
