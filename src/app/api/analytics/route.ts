import { userAgent, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import {
  BEACON_MAX_BYTES,
  beaconSchema,
  browserName,
  clientAddress,
  countryCode,
  deviceType,
  isAutomated,
  pageView,
  referrerHost,
  systemName,
} from "@/lib/analytics";
import { adminClient } from "@/lib/supabase/admin";

// Leaving a view out is not an error the browser needs to hear about.
const done = () => new Response(null, { status: 204 });

function sameOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!host || !origin || (site && site !== "same-origin")) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// A page view for the admin panel's statistics, sent by PageViews in the root layout. Bots,
// admin pages and signed-in admins are left out, and the database hashes the address and user
// agent into a visitor that changes daily (migration 20260926060000); neither is stored.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > BEACON_MAX_BYTES)
    return new Response("Too large", { status: 413 });
  const text = await request.text();
  if (text.length > BEACON_MAX_BYTES) return new Response("Too large", { status: 413 });
  let beacon;
  try {
    beacon = beaconSchema.parse(JSON.parse(text));
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const agent = request.headers.get("user-agent");
  const parsed = userAgent(request);
  if (parsed.isBot || isAutomated(agent)) return done();
  const view = pageView(beacon.path);
  if (!view || (await isAdmin())) return done();

  try {
    const { error } = await adminClient().rpc("record_page_view", {
      p_ip: clientAddress(request.headers),
      p_user_agent: agent ?? "",
      p_path: view.path,
      p_referrer: referrerHost(beacon.referrer, request.headers.get("host") ?? ""),
      p_utm_source: view.utmSource,
      p_utm_medium: view.utmMedium,
      p_utm_campaign: view.utmCampaign,
      p_country: countryCode(request.headers.get("x-vercel-ip-country")),
      p_device: deviceType(parsed.device.type),
      p_browser: browserName(parsed.browser.name),
      p_os: systemName(parsed.os.name),
    });
    if (error) console.error("A page view could not be recorded:", error.code);
  } catch (error) {
    console.error("A page view could not be recorded:", (error as Error).message);
  }
  return done();
}
