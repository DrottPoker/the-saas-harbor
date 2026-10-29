"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionState } from "@/lib/domain";
import { sendQueuedEmails } from "@/lib/email/outbox";
import { providerAccessKind } from "@/lib/revenue/catalog";
import { beginRevenueCheck } from "@/lib/revenue/connect";
import { localizedMakerMessage, VerificationError } from "@/lib/revenue/errors";
import { verificationSummary } from "@/lib/revenue/summary";
import { disconnectProvider, syncConnection } from "@/lib/revenue/sync";
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
  if (!data) throw new VerificationError("check.ownSaasOnly");
  return client as SupabaseClient<Database>;
}

// Redirects, such as to sign-in, pass through; failures show only words written for makers, in
// the founder's language.
async function failure(error: unknown): Promise<ActionState> {
  unstable_rethrow(error);
  return { error: await localizedMakerMessage(error) };
}

export async function refreshRevenueAction(saasId: string): Promise<ActionState> {
  try {
    const client = await requireOwnedSaas(saasId);
    await beginRevenueCheck(client, saasId, true);
    const result = await syncConnection(saasId);
    sendQueuedEmails();
    revalidatePath("/", "layout");
    return { success: await verificationSummary(result) };
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
    // A provider connected through OAuth gave access the founder approved, not a pasted key.
    const t = await getTranslations("revenue.result");
    return { success: t("disconnected", { access: providerAccessKind(connection?.provider) }) };
  } catch (error) {
    return failure(error);
  }
}
