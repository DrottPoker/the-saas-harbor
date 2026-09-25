"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatUsd, type ActionState } from "@/lib/domain";
import { isProviderId, providerName, type ProviderId } from "@/lib/revenue/catalog";
import { makerMessage, VerificationError } from "@/lib/revenue/errors";
import { adapter } from "@/lib/revenue/providers";
import {
  allowTestKeys,
  connectProvider,
  disconnectProvider,
  syncConnection,
  type Verification,
} from "@/lib/revenue/sync";
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
  if (!data) throw new VerificationError("You can only verify revenue for your own SaaS.");
  return client as SupabaseClient<Database>;
}

// Every check, successful or not, counts against the limits in begin_revenue_check: a refresh at
// most every five minutes per product, and 20 checks an hour per maker.
async function beginCheck(client: SupabaseClient<Database>, saasId: string, refresh: boolean) {
  const { error } = await client.rpc("begin_revenue_check", { p_saas: saasId, p_refresh: refresh });
  if (error?.code === "P0001") throw new VerificationError(`${error.message}.`);
  if (error) throw new Error(`The revenue check could not start: ${error.message}`);
}

// What could not be counted, in each provider's terms.
const skipped: Record<ProviderId, [string, string]> = {
  stripe: ["usage-based item was", "usage-based items were"],
  paddle: ["subscription without a paid charge was", "subscriptions without a paid charge were"],
  polar: ["subscription was", "subscriptions were"],
  dodo: [
    "tax-inclusive subscription without a payment was",
    "tax-inclusive subscriptions without a payment were",
  ],
};

function summary(result: Verification) {
  const customers = `${result.customers} paying ${result.customers === 1 ? "customer" : "customers"}`;
  const [one, many] = skipped[result.provider];
  const notCounted = result.skippedItems
    ? ` ${result.skippedItems} ${result.skippedItems === 1 ? one : many} not counted.`
    : "";
  const history = result.historyNote ? ` ${result.historyNote}` : "";
  return `Verified MRR: ${formatUsd(result.mrrCents)} from ${customers}.${notCounted}${history}`;
}

// Redirects, such as to sign-in, pass through; failures show only words written for makers.
function failure(error: unknown): ActionState {
  unstable_rethrow(error);
  return { error: makerMessage(error) };
}

// The provider is bound on the client with the SaaS id, so it is checked here like any input.
export async function connectProviderAction(
  saasId: string,
  provider: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const client = await requireOwnedSaas(saasId);
    if (!isProviderId(provider)) throw new VerificationError("Choose a payment provider.");
    const key = adapter(provider).parseKey(String(form.get("provider_key") ?? ""), {
      allowTest: allowTestKeys(),
    });
    await beginCheck(client, saasId, false);
    const result = await connectProvider(saasId, provider, key);
    revalidatePath("/", "layout");
    return { success: `${providerName(provider)} connected. ${summary(result)}` };
  } catch (error) {
    return failure(error);
  }
}

export async function refreshRevenueAction(saasId: string): Promise<ActionState> {
  try {
    const client = await requireOwnedSaas(saasId);
    await beginCheck(client, saasId, true);
    const result = await syncConnection(saasId);
    revalidatePath("/", "layout");
    return { success: summary(result) };
  } catch (error) {
    revalidatePath("/", "layout");
    return failure(error);
  }
}

export async function disconnectProviderAction(saasId: string): Promise<ActionState> {
  try {
    await requireOwnedSaas(saasId);
    await disconnectProvider(saasId);
    revalidatePath("/", "layout");
    return { success: "Disconnected. The stored key was deleted." };
  } catch (error) {
    return failure(error);
  }
}
