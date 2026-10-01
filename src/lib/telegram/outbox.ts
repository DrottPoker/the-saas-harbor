import "server-only";
import { after } from "next/server";
import { siteUrl } from "../seo";
import { adminClient } from "../supabase/admin";
import { renderAlert } from "./alerts";
import { sendTelegramMessage, TelegramError, telegramConfig } from "./api";

// claim_telegram_alerts locks an alert for two minutes. A run claims nothing new after 30 seconds
// and each request gives up after 10, so an alert is not claimed again while it is being sent.
const RUN_MS = 30_000;

/**
 * Sends the Telegram alerts that are due to the owner's chat, claiming one at a time. The database
 * queues them and reads what they say; this trusted worker claims them with the service role.
 * Without TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID it claims nothing, and alerts wait for a day.
 */
export async function deliverTelegramAlerts(limit = 25) {
  const result = { configured: false, sent: 0, skipped: 0, failed: 0, deferred: 0 };
  const config = telegramConfig();
  if (!config) return result;
  result.configured = true;
  const admin = adminClient();
  const stop = Date.now() + RUN_MS;
  for (let done = 0; done < limit && Date.now() < stop; done++) {
    const { data, error } = await admin.rpc("claim_telegram_alerts", { p_limit: 1 });
    if (error) throw new Error("Queued Telegram alerts could not be read.");
    const row = data[0];
    if (!row) break;
    const message = renderAlert(row, siteUrl());
    let status: "sent" | "skipped" | "failed" | "deferred" = "skipped";
    let problem: string | null = "Nothing to send any more";
    let retryAfter: number | null = null;
    if (message) {
      try {
        await sendTelegramMessage(config, message);
        [status, problem] = ["sent", null];
      } catch (cause) {
        const error = cause instanceof TelegramError ? cause : null;
        // An outage, a rate limit or a refused token or chat puts the alert back without counting
        // an attempt; a failure of this alert counts.
        status = error?.service ? "deferred" : "failed";
        problem = error ? error.message : "Sending failed";
        retryAfter = error?.retryAfter ?? null;
      }
    }
    const { error: completeError } = await admin.rpc("complete_telegram_alert", {
      p_id: row.id,
      p_status: status,
      p_error: problem,
      p_retry_after: retryAfter,
    });
    if (completeError) throw new Error("A sent Telegram alert could not be recorded.");
    result[status]++;
    // The rest would meet the same failure, or Telegram asked to slow down, so they wait for a
    // later run.
    if (status === "deferred") {
      console.error(`Sending Telegram alerts paused: ${problem}`);
      break;
    }
  }
  return result;
}

/** After the response, sends the alerts an action just queued, such as for new feedback. */
export function sendQueuedTelegramAlerts() {
  after(async () => {
    try {
      await deliverTelegramAlerts();
    } catch {
      console.error("Telegram alerts could not be sent. They stay queued.");
    }
  });
}
