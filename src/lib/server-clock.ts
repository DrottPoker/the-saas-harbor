import "server-only";
import { headers } from "next/headers";
import type { ServerClock } from "@/components/local-time";
import { ipTimeZone } from "./time";

/**
 * What the server knows of the visitor's clock: the time zone the host looks up from the IP
 * address, and the time of the request. `LocalTime` renders with it until the browser gives the
 * device's own time zone. Nothing of it is stored.
 */
export async function serverClock(): Promise<ServerClock> {
  const timeZone = ipTimeZone((await headers()).get("x-vercel-ip-timezone"));
  return { timeZone, now: Date.now() };
}
