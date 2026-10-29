"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { LOCALE_INFO } from "@/i18n/config";
import { formatCount } from "@/lib/display-money";
import { MESSAGE_MAX_LENGTH, type ActionState } from "@/lib/domain";
import { sendQueuedEmails } from "@/lib/email/outbox";
import { SEND_ERRORS, type SendState } from "@/lib/messages";
import { requireUser } from "@/lib/supabase/server";
import { sendQueuedTelegramAlerts } from "@/lib/telegram/outbox";

const id = z.uuid();

export async function sendMessageAction(
  recipientId: string,
  _state: SendState,
  form: FormData,
): Promise<SendState> {
  const { client } = await requireUser();
  const [t, locale] = await Promise.all([getTranslations("messages.errors"), getLocale()]);
  const max = formatCount(MESSAGE_MAX_LENGTH, LOCALE_INFO[locale].intl);
  if (!id.safeParse(recipientId).success) return { error: t("userNotFound") };
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: t("empty") };
  // Characters as the database counts them, not UTF-16 units.
  if ([...body].length > MESSAGE_MAX_LENGTH) return { error: t("tooLong", { max }) };
  const { data, error } = await client.rpc("send_message", {
    p_recipient: recipientId,
    p_body: body,
  });
  if (error) {
    // P0001 errors are written for users by send_message(); one this server does not know yet
    // keeps its English text.
    const known = error.code === "P0001" ? SEND_ERRORS.get(error.message) : undefined;
    return {
      error: known
        ? t(known, { max })
        : error.code === "P0001"
          ? `${error.message}.`
          : t("sendFailed"),
    };
  }
  // A message email waits a few minutes, so this sends what became due in the meantime.
  sendQueuedEmails();
  sendQueuedTelegramAlerts();
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
  const t = await getTranslations("messages.errors");
  if (!id.safeParse(makerId).success || makerId === user.id) return { error: t("userNotFound") };
  const { error } = blocked
    ? await client.from("blocks").insert({ blocker_id: user.id, blocked_id: makerId })
    : await client.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", makerId);
  // 23505: already blocked.
  if (error && error.code !== "23505")
    return { error: blocked ? t("blockFailed") : t("unblockFailed") };
  revalidatePath("/messages", "layout");
  return {};
}
