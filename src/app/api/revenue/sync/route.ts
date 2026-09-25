import { authorizedCron } from "@/lib/cron";
import { syncAllConnections } from "@/lib/revenue/sync";

// Scheduled re-verification of every payment provider connection. Call daily with
// `Authorization: Bearer $CRON_SECRET` (see `npm run revenue:sync`).
export async function POST(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await syncAllConnections());
}
