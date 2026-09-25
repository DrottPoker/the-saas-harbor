import { authorizedCron } from "@/lib/cron";
import { syncDueConnections } from "@/lib/revenue/sync";

// A run claims no new connections after four minutes, so it ends well within this limit.
export const maxDuration = 300;

// Scheduled re-verification of the payment provider connections that are due: each about every
// hour. The database calls it every ten minutes with `Authorization: Bearer $CRON_SECRET`
// (migration 20260926010000, `npm run revenue:sync` locally).
export async function POST(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await syncDueConnections());
}
