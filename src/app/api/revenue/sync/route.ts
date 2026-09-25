import { authorizedCron } from "@/lib/cron";
import { syncDueConnections } from "@/lib/revenue/sync";

// A run claims no new connections after four minutes, so it ends well within this limit.
export const maxDuration = 300;

// Scheduled re-verification of the payment provider connections that are due: each about every
// hour. Call every ten minutes with `Authorization: Bearer $CRON_SECRET` (see
// `npm run revenue:sync`).
export async function POST(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await syncDueConnections());
}
