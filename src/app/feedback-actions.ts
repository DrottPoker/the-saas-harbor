"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/domain";
import { feedbackPage, feedbackSchema } from "@/lib/feedback";
import { adminSession } from "@/lib/admin";
import { requireUser } from "@/lib/supabase/server";

export async function submitFeedbackAction(
  from: string | null,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireUser();
  const parsed = feedbackSchema.safeParse({
    kind: String(form.get("kind") ?? ""),
    message: String(form.get("message") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { error } = await client.rpc("submit_feedback", {
    p_kind: parsed.data.kind,
    p_message: parsed.data.message,
    p_page: feedbackPage(from),
  });
  if (error)
    return {
      // P0001 errors are written for users by submit_feedback().
      error:
        error.code === "P0001"
          ? `${error.message}.`
          : "Your feedback could not be sent. Please try again.",
    };
  revalidatePath("/admin", "layout");
  return { success: "sent" };
}

/** Marks feedback handled, or new again, from the admin panel. */
export async function setFeedbackHandledAction(form: FormData) {
  const session = await adminSession();
  if (!session) return;
  const { error } = await session.client.rpc("admin_set_feedback_handled", {
    p_feedback: String(form.get("id") ?? ""),
    p_handled: form.get("handled") === "true",
  });
  if (error) throw new Error("The feedback could not be updated. Try again.");
  revalidatePath("/admin", "layout");
}
