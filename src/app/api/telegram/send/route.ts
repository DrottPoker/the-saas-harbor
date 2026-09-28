import { authorizedCron } from "@/lib/cron";
import { deliverTelegramAlerts } from "@/lib/telegram/outbox";

export const maxDuration = 60;

// Sends the Telegram alerts that are due. The database calls it every minute with
// `Authorization: Bearer $CRON_SECRET` (migration 20260928110000); actions also send what they
// queue right after responding, so this sends the rest, such as alerts to try again.
export async function POST(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await deliverTelegramAlerts(100));
}
