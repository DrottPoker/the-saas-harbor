"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/domain";
import { checkDomain, recordName, websiteDomain } from "@/lib/domain-verification";
import { requireUser } from "@/lib/supabase/server";

const NOT_OWNER = "You can only verify the domain of your own SaaS.";

/** The founder's own check of their product's DNS record. */
export async function checkDomainAction(saasId: string): Promise<ActionState> {
  const { user, client } = await requireUser();
  if (!z.uuid().safeParse(saasId).success) return { error: NOT_OWNER };
  const { data: saas, error } = await client
    .from("saas")
    .select("website")
    .eq("id", saasId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return { error: "The SaaS could not be loaded. Please try again." };
  if (!saas) return { error: NOT_OWNER };
  const domain = websiteDomain(saas.website);
  if (!domain)
    return {
      error:
        "Your website's address is not on a domain of its own, so there is nowhere to add the record.",
    };
  // Checks ownership again and limits how often a founder checks.
  const { data: token, error: beginError } = await client.rpc("begin_domain_check", {
    p_saas: saasId,
  });
  if (beginError)
    return {
      // P0001 errors, such as the limits, are written for makers by the database.
      error:
        beginError.code === "P0001"
          ? `${beginError.message}.`
          : "The domain could not be checked. Please try again.",
    };
  let outcome;
  try {
    outcome = await checkDomain(saasId, saas.website, token);
  } catch (cause) {
    console.error("A domain check failed:", cause instanceof Error ? cause.message : cause);
    return { error: "The domain could not be checked. Please try again." };
  }
  revalidatePath("/", "layout");
  switch (outcome) {
    case "verified":
      return { success: `${domain} is verified. We check the record again every day.` };
    case "missing":
      return {
        error: `The record was not found at ${recordName(domain)}. Check its name and value; new records can take a few minutes to appear.`,
      };
    case "grace":
      return {
        error: `The record was not found at ${recordName(domain)}. ${domain} stays verified for three days after the record goes missing, so add it back before then.`,
      };
    case "removed":
      return {
        error: `The record has been missing for three days, so ${domain} is no longer verified. Add it again to verify the domain.`,
      };
    case "error":
      return { error: "DNS did not answer in time. Please try again in a moment." };
    default:
      return { error: "Your website changed during the check. Please try again." };
  }
}
