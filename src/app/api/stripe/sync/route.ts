import { timingSafeEqual } from "node:crypto";
import { syncAllStripeConnections } from "@/lib/stripe/sync";

// Scheduled re-verification of every Stripe connection. Call daily with
// `Authorization: Bearer $CRON_SECRET` (see `npm run stripe:sync`).
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await syncAllStripeConnections());
}
