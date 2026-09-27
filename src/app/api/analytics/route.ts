import { userAgent, type NextRequest } from "next/server";
import { sessionIsAdmin } from "@/lib/admin";
import {
  BEACON_MAX_BYTES,
  beaconSchema,
  cityName,
  clientAddress,
  countryCode,
  isAutomated,
  languageCode,
  outboundTarget,
  pageView,
  referrerHost,
  technology,
  type Beacon,
} from "@/lib/analytics";
import { adminClient } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";

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

type Client = ReturnType<typeof adminClient>;

async function recordTime(client: Client, time: { key: string; ms: number }) {
  const { error } = await client.rpc("track_page_time", { p_key: time.key, p_engaged_ms: time.ms });
  if (error) console.error("Page time could not be recorded:", error.code);
}

async function record(request: NextRequest, beacon: Beacon, viewer: string | null) {
  const headers = request.headers;
  const agent = headers.get("user-agent") ?? "";
  const ip = clientAddress(headers);
  const host = headers.get("host") ?? "";
  const client = adminClient();

  if (beacon.type === "engagement") {
    await recordTime(client, beacon);
    return done();
  }
  // The page before counts first, so the time spent on it keeps the visit going.
  if (beacon.type === "pageview" && beacon.previous) await recordTime(client, beacon.previous);

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

  // The database keeps where a visit came from only on its first page. A page that starts a visit
  // without a page load, after a pause, carries the tab's referrer and first address's campaign tags.
  const tags = (beacon.landing ? pageView(beacon.landing) : null) ?? view;
  const tech = technology(agent, userAgent(request), beacon.system);
  const { error } = await client.rpc("track_page_view", {
    p_ip: ip,
    p_user_agent: agent,
    p_path: view.path,
    p_referrer: referrerHost(beacon.referrer, host),
    p_utm_source: tags.utmSource,
    p_utm_medium: tags.utmMedium,
    p_utm_campaign: tags.utmCampaign,
    p_utm_term: tags.utmTerm,
    p_utm_content: tags.utmContent,
    p_country: countryCode(headers.get("x-vercel-ip-country")),
    p_city: cityName(headers.get("x-vercel-ip-city")),
    p_language: languageCode(headers.get("accept-language")),
    p_device: tech.device,
    p_browser: tech.browser,
    p_browser_version: tech.browserVersion,
    p_os: tech.os,
    p_os_version: tech.osVersion,
    // Only leaves out a founder's views of their own product; not stored.
    p_viewer: viewer,
    p_key: beacon.key,
  });
  if (error) console.error("A page view could not be recorded:", error.code);
  return done();
}

// Site statistics from PageViews in the root layout: page views, how long pages were visible, and
// clicks on links to other sites. Bots, admin pages and signed-in admins are left out, and the
// database hashes the address and user agent into a visitor that changes daily; neither is stored
// (migrations 20260926060000 and 20260926070000). A view of a product's page also counts for the
// product, unless its founder is the one signed in (migration 20260926080000). Page time comes with
// the key the page gave its page view (migration 20260927120000).
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
  const viewer = await currentUser();
  if (viewer && (await sessionIsAdmin())) return done();
  try {
    return await record(request, beacon, viewer?.id ?? null);
  } catch (error) {
    console.error("Site statistics could not be recorded:", (error as Error).message);
    return done();
  }
}
