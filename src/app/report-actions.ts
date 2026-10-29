"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { LOCALE_INFO } from "@/i18n/config";
import { formatCount } from "@/lib/display-money";
import { reportSchema, type ActionState } from "@/lib/domain";
import { sendQueuedEmails } from "@/lib/email/outbox";
import { localizeValidation } from "@/lib/localize-validation";
import { DETAILS_MAX_LENGTH, isReportTarget, REPORT_ERRORS } from "@/lib/moderation";
import { requireUser } from "@/lib/supabase/server";
import { sendQueuedTelegramAlerts } from "@/lib/telegram/outbox";
import { localeRedirect } from "@/i18n/navigation";

export async function submitReportAction(
  target: string,
  id: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { client } = await requireUser();
  const t = await getTranslations("reports.errors");
  if (!isReportTarget(target) || !z.uuid().safeParse(id).success)
    return { error: t("cannotReport") };
  const parsed = reportSchema.safeParse({
    reason: String(form.get("reason") ?? ""),
    details: String(form.get("details") ?? ""),
  });
  if (!parsed.success) return { error: await localizeValidation(parsed.error) };
  const { error } = await client.rpc("submit_report", {
    p_target: target,
    p_id: id,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details,
  });
  if (error) {
    // P0001 errors are written for users by submit_report(); one this server does not know yet
    // keeps its English text.
    const known = error.code === "P0001" ? REPORT_ERRORS.get(error.message) : undefined;
    const max = formatCount(DETAILS_MAX_LENGTH, LOCALE_INFO[await getLocale()].intl);
    return {
      error: known
        ? t(known, { max })
        : error.code === "P0001"
          ? `${error.message}.`
          : t("sendFailed"),
    };
  }
  // The admins' email about waiting reports, and the owner's Telegram alert.
  sendQueuedEmails();
  sendQueuedTelegramAlerts();
  revalidatePath("/dashboard/reports");
  return localeRedirect("/dashboard/reports?sent=1");
}
