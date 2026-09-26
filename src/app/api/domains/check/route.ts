import { authorizedCron } from "@/lib/cron";
import { recheckVerifiedDomains } from "@/lib/domain-verification";

// A run stops claiming after 50 seconds, so it ends well within this limit.
export const maxDuration = 60;

// The daily check of verified domains: each product's DNS record is looked up again about once a
// day. The database calls it every hour with `Authorization: Bearer $CRON_SECRET` (migration
// 20260926100000, `npm run domains:check` locally).
export async function POST(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await recheckVerifiedDomains());
}
