import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Scheduled jobs call with `Authorization: Bearer $CRON_SECRET`, compared in constant time. */
export function authorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
