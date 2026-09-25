import { authorizedCron } from "@/lib/cron";
import { deliverEmails } from "@/lib/email/outbox";

// Sends the notification emails that are due. Call every minute or so with
// `Authorization: Bearer $CRON_SECRET` (see `npm run email:send`); actions also send what they
// queue right after responding, but message emails wait a few minutes and need this.
export async function POST(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await deliverEmails(100));
}

// Vercel Cron (vercel.json) calls with GET and the same header.
export const GET = POST;
