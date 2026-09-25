import { authorizedCron } from "@/lib/cron";
import { deliverEmails } from "@/lib/email/outbox";

// Sends the notification emails that are due. The database calls it every minute with
// `Authorization: Bearer $CRON_SECRET` (migration 20260926010000, `npm run email:send` locally); actions also send what they
// queue right after responding, but message emails wait a few minutes and need this.
export async function POST(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await deliverEmails(100));
}
