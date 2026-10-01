"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionState } from "@/lib/domain";
import { sendQueuedEmails } from "@/lib/email/outbox";
import { connectsWithOAuth, isProviderId, providerName } from "@/lib/revenue/catalog";
import { makerMessage, VerificationError } from "@/lib/revenue/errors";
import { adapter } from "@/lib/revenue/providers";
import { summary } from "@/lib/revenue/summary";
import {
  allowTestKeys,
  connectProvider,
  disconnectProvider,
  syncConnection,
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
    const key = adapter(provider).parseKey(
      {
        key: String(form.get("provider_key") ?? ""),
        account: String(form.get("provider_account") ?? ""),
      },
      { allowTest: allowTestKeys() },
    );
    await beginCheck(client, saasId, false);
    const result = await connectProvider(saasId, provider, key);
    // A verification may reach a milestone, which queues an email.
    sendQueuedEmails();
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
    sendQueuedEmails();
    revalidatePath("/", "layout");
    return { success: summary(result) };
  } catch (error) {
    revalidatePath("/", "layout");
    return failure(error);
  }
}

export async function disconnectProviderAction(saasId: string): Promise<ActionState> {
  try {
    const client = await requireOwnedSaas(saasId);
    const { data: connection } = await client
      .from("revenue_connections")
      .select("provider")
      .eq("saas_id", saasId)
      .maybeSingle();
    await disconnectProvider(client, saasId);
    revalidatePath("/", "layout");
    // Gumroad gave access the founder approved rather than a key they pasted.
    const oauth =
      !!connection && isProviderId(connection.provider) && connectsWithOAuth(connection.provider);
    return {
      success: `Disconnected. The stored ${oauth ? "access" : "key"} was deleted.`,
    };
  } catch (error) {
    return failure(error);
  }
}
