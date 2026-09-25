import { authorizedCron } from "@/lib/cron";
import { syncAllStripeConnections } from "@/lib/stripe/sync";

// Scheduled re-verification of every Stripe connection. Call daily with
// `Authorization: Bearer $CRON_SECRET` (see `npm run stripe:sync`).
export async function POST(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await syncAllStripeConnections());
}
