import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  encodeGumroadFlow,
  encodeGumroadResult,
  GUMROAD_FLOW_COOKIE,
  GUMROAD_FLOW_SECONDS,
  GUMROAD_RESULT_COOKIE,
  gumroadAuthorizeUrl,
  gumroadClient,
  newGumroadFlow,
} from "@/lib/revenue/gumroad/oauth";
import { siteUrl } from "@/lib/seo";
import { cookieOptions } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Starts connecting Gumroad to a product the signed-in founder owns. The editor links here rather
// than submitting a form, so the redirect to Gumroad is a plain navigation, which the form-action
// policy does not cover. The state and the PKCE verifier wait in a cookie for the callback.
export async function GET(request: NextRequest) {
  const saasId = request.nextUrl.searchParams.get("saas") ?? "";
  const { user, client } = await requireUser();
  const dashboard = NextResponse.redirect(new URL("/dashboard", siteUrl()));
  if (!UUID.test(saasId)) return dashboard;
  const { data: owned } = await client
    .from("saas")
    .select("id")
    .eq("id", saasId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!owned) return dashboard;
  const jar = await cookies();
  const app = gumroadClient();
  if (!app) {
    jar.set(
      GUMROAD_RESULT_COOKIE,
      encodeGumroadResult({
        saasId,
        tone: "error",
        text: "Gumroad is not set up on this server yet.",
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: cookieOptions.secure,
        maxAge: 60,
        path: "/dashboard",
      },
    );
    return NextResponse.redirect(new URL(`/dashboard/saas/${saasId}?gumroad=1#revenue`, siteUrl()));
  }
  const flow = newGumroadFlow(saasId, user.id);
  jar.set(GUMROAD_FLOW_COOKIE, encodeGumroadFlow(flow), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieOptions.secure,
    maxAge: GUMROAD_FLOW_SECONDS,
    path: "/api/gumroad",
  });
  return NextResponse.redirect(gumroadAuthorizeUrl(app.id, flow));
}
