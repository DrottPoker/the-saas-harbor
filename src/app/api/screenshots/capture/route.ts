import { z } from "zod";
import { authorizedCron } from "@/lib/cron";
import { captureDueScreenshots } from "@/lib/screenshots";

// A run stops claiming after 90 seconds, and a screenshot takes at most about 30.
export const maxDuration = 120;

const bodySchema = z.object({ saas: z.uuid().optional() });

// Screenshots of the products that are due. The database calls it every five minutes with
// `Authorization: Bearer $CRON_SECRET` (migration 20260926110000, `npm run screenshots:capture`
// locally). A body of {"saas": "<id>"} takes that product only, if it is due.
export async function POST(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return new Response("Bad request", { status: 400 });
  return Response.json(await captureDueScreenshots({ saasId: body.data.saas }));
}
