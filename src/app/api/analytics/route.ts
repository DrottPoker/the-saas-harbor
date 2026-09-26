import { userAgent, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import {
  BEACON_MAX_BYTES,
  beaconSchema,
  browserName,
  cityName,
  clientAddress,
  countryCode,
  deviceType,
  isAutomated,
  languageCode,
  majorVersion,
  outboundTarget,
  pageView,
  referrerHost,
  systemName,
  type Beacon,
} from "@/lib/analytics";
import { adminClient } from "@/lib/supabase/admin";

// Leaving something out is not an error the browser needs to hear about.
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

async function record(request: NextRequest, beacon: Beacon) {
  const headers = request.headers;
  const agent = headers.get("user-agent") ?? "";
  const ip = clientAddress(headers);
  const host = headers.get("host") ?? "";
  const client = adminClient();

  if (beacon.type === "engagement") {
    const { error } = await client.rpc("track_engagement", {
      p_ip: ip,
      p_user_agent: agent,
      p_id: beacon.id,
      p_engaged_ms: beacon.ms,
    });
    if (error) console.error("Page time could not be recorded:", error.code);
    return done();
  }

  const view = pageView(beacon.path);
  if (!view) return done();

  if (beacon.type === "outbound") {
    const target = outboundTarget(beacon.url, host);
    if (!target) return done();
    const { error } = await client.rpc("track_outbound_click", {
      p_ip: ip,
      p_user_agent: agent,
      p_path: view.path,
      p_target: target.target,
      p_target_host: target.host,
    });
    if (error) console.error("A link click could not be recorded:", error.code);
    return done();
  }

  const parsed = userAgent(request);
  const { data, error } = await client.rpc("track_page_view", {
    p_ip: ip,
    p_user_agent: agent,
    p_path: view.path,
    p_referrer: referrerHost(beacon.referrer, host),
    p_utm_source: view.utmSource,
    p_utm_medium: view.utmMedium,
    p_utm_campaign: view.utmCampaign,
    p_utm_term: view.utmTerm,
    p_utm_content: view.utmContent,
    p_country: countryCode(headers.get("x-vercel-ip-country")),
    p_city: cityName(headers.get("x-vercel-ip-city")),
    p_language: languageCode(headers.get("accept-language")),
    p_device: deviceType(parsed.device.type),
    p_browser: browserName(parsed.browser.name),
    p_browser_version: majorVersion(parsed.browser.version),
    p_os: systemName(parsed.os.name),
    p_os_version: majorVersion(parsed.os.version),
  });
  if (error) {
    console.error("A page view could not be recorded:", error.code);
    return done();
  }
  // The id lets the browser report how long the page was visible.
  return data === null ? done() : Response.json({ id: data });
}

// Site statistics from PageViews in the root layout: page views, how long pages were visible, and
// clicks on links to other sites. Bots, admin pages and signed-in admins are left out, and the
// database hashes the address and user agent into a visitor that changes daily; neither is stored
// (migrations 20260926060000 and 20260926070000).
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > BEACON_MAX_BYTES)
    return new Response("Too large", { status: 413 });
  const text = await request.text();
  if (text.length > BEACON_MAX_BYTES) return new Response("Too large", { status: 413 });
  let beacon: Beacon;
  try {
    beacon = beaconSchema.parse(JSON.parse(text));
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (userAgent(request).isBot || isAutomated(request.headers.get("user-agent"))) return done();
  if (await isAdmin()) return done();
  try {
    return await record(request, beacon);
  } catch (error) {
    console.error("Site statistics could not be recorded:", (error as Error).message);
    return done();
  }
}
