"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MESSAGE_MAX_LENGTH, type ActionState } from "@/lib/domain";
import { sendQueuedEmails } from "@/lib/email/outbox";
import type { SendState } from "@/lib/messages";
import { requireUser } from "@/lib/supabase/server";

const id = z.uuid();

export async function sendMessageAction(
  recipientId: string,
  _state: SendState,
  form: FormData,
): Promise<SendState> {
  const { client } = await requireUser();
  if (!id.safeParse(recipientId).success) return { error: "This maker could not be found." };
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Write a message first." };
  // Characters as the database counts them, not UTF-16 units.
  if ([...body].length > MESSAGE_MAX_LENGTH)
    return { error: "Messages can be up to 4,000 characters." };
  const { data, error } = await client.rpc("send_message", {
    p_recipient: recipientId,
    p_body: body,
  });
  if (error)
    return {
      // P0001 errors are written for makers by send_message().
      error:
        error.code === "P0001"
          ? `${error.message}.`
          : "Your message could not be sent. Please try again.",
    };
  // A message email waits a few minutes, so this sends what became due in the meantime.
  sendQueuedEmails();
  const { conversation_id, sender_id, created_at } = data;
  return { message: { id: data.id, conversation_id, sender_id, body: data.body, created_at } };
}

export async function markConversationReadAction(conversationId: string, readAt: string) {
  const { client } = await requireUser();
  if (!id.safeParse(conversationId).success || Number.isNaN(Date.parse(readAt))) return;
  await client.rpc("mark_conversation_read", {
    p_conversation: conversationId,
    p_read_at: readAt,
  });
}

export async function setBlockedAction(makerId: string, blocked: boolean): Promise<ActionState> {
  const { user, client } = await requireUser();
  if (!id.safeParse(makerId).success || makerId === user.id)
    return { error: "This maker could not be found." };
  const { error } = blocked
    ? await client.from("blocks").insert({ blocker_id: user.id, blocked_id: makerId })
    : await client.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", makerId);
  // 23505: already blocked.
  if (error && error.code !== "23505")
    return {
      error: blocked
        ? "The maker could not be blocked. Please try again."
        : "The maker could not be unblocked. Please try again.",
    };
  revalidatePath("/messages", "layout");
  return {};
}
