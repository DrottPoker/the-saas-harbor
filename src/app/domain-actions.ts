"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { ActionState } from "@/lib/domain";
import { checkDomain, recordName, websiteDomain } from "@/lib/domain-verification";
import { requireUser } from "@/lib/supabase/server";

// What begin_domain_check says, by its English words, as domains.result messages.
const CHECK_PROBLEMS: Partial<Record<string, "notOwner" | "tooSoon" | "tooOften">> = {
  "You can only verify the domain of your own SaaS": "notOwner",
  "The domain was checked a moment ago. Try again in a few seconds": "tooSoon",
  "Domains were checked many times in the last hour. Try again later": "tooOften",
};

/** The founder's own check of their product's DNS record. */
export async function checkDomainAction(saasId: string): Promise<ActionState> {
  const [{ user, client }, t] = await Promise.all([
    requireUser(),
    getTranslations("domains.result"),
  ]);
  if (!z.uuid().safeParse(saasId).success) return { error: t("notOwner") };
  const { data: saas, error } = await client
    .from("saas")
    .select("website")
    .eq("id", saasId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return { error: t("loadFailed") };
  if (!saas) return { error: t("notOwner") };
  const domain = websiteDomain(saas.website);
  if (!domain) return { error: t("noDomain") };
  // Checks ownership again and limits how often a founder checks.
  const { data: token, error: beginError } = await client.rpc("begin_domain_check", {
    p_saas: saasId,
  });
  if (beginError) {
    // P0001 errors, such as the limits, are written for makers by the database.
    const problem = beginError.code === "P0001" ? CHECK_PROBLEMS[beginError.message] : undefined;
    return {
      error: problem
        ? t(problem)
        : beginError.code === "P0001"
          ? `${beginError.message}.`
          : t("failed"),
    };
  }
  let outcome;
  try {
    outcome = await checkDomain(saasId, saas.website, token);
  } catch (cause) {
    console.error("A domain check failed:", cause instanceof Error ? cause.message : cause);
    return { error: t("failed") };
  }
  revalidatePath("/", "layout");
  const record = recordName(domain);
  switch (outcome) {
    case "verified":
      return { success: t("verified", { domain }) };
    case "missing":
      return { error: t("missing", { record }) };
    case "grace":
      return { error: t("grace", { record, domain }) };
    case "removed":
      return { error: t("removed", { domain }) };
    case "error":
      return { error: t("dnsTimeout") };
    default:
      return { error: t("changed") };
  }
}
