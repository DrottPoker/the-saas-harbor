"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clientAddress } from "@/lib/analytics";
import type { ActionState } from "@/lib/domain";
import { FEEDBACK_TRAP, feedbackPage, feedbackSchema } from "@/lib/feedback";
import { adminSession } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/admin";
import { currentUser, requireUser } from "@/lib/supabase/server";
import { sendQueuedTelegramAlerts } from "@/lib/telegram/outbox";

/**
 * Feedback from a signed-in user, under their account, or from a visitor, which the server sends
 * for them with the service role: visitors cannot call the database for it themselves, so the
 * limits per visitor hold (the owner's request of 2026-10-04).
 */
export async function submitFeedbackAction(
  from: string | null,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = feedbackSchema.safeParse({
    kind: String(form.get("kind") ?? ""),
    message: String(form.get("message") ?? ""),
    email: String(form.get("email") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  // A field people never see: a bot that fills it in is thanked, and nothing is stored.
  if (String(form.get(FEEDBACK_TRAP) ?? "")) return { success: "sent" };
  const user = await currentUser();
  const { kind, message, email } = parsed.data;
  const page = feedbackPage(from);
  let error: { code: string; message: string } | null;
  if (user) {
    const { client } = await requireUser();
    ({ error } = await client.rpc("submit_feedback", {
      p_kind: kind,
      p_message: message,
      p_page: page,
    }));
  } else {
    const list = await headers();
    ({ error } = await adminClient().rpc("submit_visitor_feedback", {
      p_ip: clientAddress(list),
      p_user_agent: list.get("user-agent") ?? "",
      p_kind: kind,
      p_message: message,
      p_page: page,
      p_reply_email: email || null,
    }));
  }
  if (error)
    return {
      // P0001 errors are written for users by submit_feedback().
      error:
        error.code === "P0001"
          ? `${error.message}.`
          : "Your feedback could not be sent. Please try again.",
    };
  sendQueuedTelegramAlerts();
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
