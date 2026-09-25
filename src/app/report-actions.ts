"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reportSchema, type ActionState } from "@/lib/domain";
import { isReportTarget } from "@/lib/moderation";
import { requireUser } from "@/lib/supabase/server";

export async function submitReportAction(
  target: string,
  id: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireUser();
  if (!isReportTarget(target) || !z.uuid().safeParse(id).success)
    return { error: "This could not be reported." };
  const parsed = reportSchema.safeParse({
    reason: String(form.get("reason") ?? ""),
    details: String(form.get("details") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { error } = await client.rpc("submit_report", {
    p_target: target,
    p_id: id,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details,
  });
  if (error)
    return {
      // P0001 errors are written for makers by submit_report().
      error:
        error.code === "P0001"
          ? `${error.message}.`
          : "Your report could not be sent. Please try again.",
    };
  revalidatePath("/dashboard/reports");
  redirect("/dashboard/reports?sent=1");
}
