import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { sendQueuedEmails } from "@/lib/email/outbox";
import { makerMessage, VerificationError } from "@/lib/revenue/errors";
import {
  decodeGumroadFlow,
  encodeGumroadResult,
  exchangeGumroadCode,
  GUMROAD_FLOW_COOKIE,
  GUMROAD_RESULT_COOKIE,
  gumroadClient,
  type GumroadResult,
} from "@/lib/revenue/gumroad/oauth";
import { summary } from "@/lib/revenue/summary";
import { connectProvider } from "@/lib/revenue/sync";
import { siteUrl } from "@/lib/seo";
import { cookieOptions } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Gumroad sends the founder back here with a code once they approve read access to their sales.
// The code is exchanged for the token only for the founder who started, with the state they
// started with, and for a product they own. The token is verified like any other key before it
// is stored, and the outcome waits in a cookie for the product's editor. Redirects go to the site's
// own address, which Gumroad returned to, so the session cookie goes along.
export async function GET(request: NextRequest) {
  const jar = await cookies();
  const flow = decodeGumroadFlow(jar.get(GUMROAD_FLOW_COOKIE)?.value);
  jar.delete({ name: GUMROAD_FLOW_COOKIE, path: "/api/gumroad" });
  if (!flow || !UUID.test(flow.saasId))
    return NextResponse.redirect(new URL("/dashboard", siteUrl()));
  const finish = (tone: GumroadResult["tone"], text: string) => {
    jar.set(GUMROAD_RESULT_COOKIE, encodeGumroadResult({ saasId: flow.saasId, tone, text }), {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieOptions.secure,
      maxAge: 60,
      path: "/dashboard",
    });
    return NextResponse.redirect(
      new URL(`/dashboard/saas/${flow.saasId}?gumroad=1#revenue`, siteUrl()),
    );
  };
  try {
    const { user, client } = await requireUser();
    if (user.id !== flow.userId) return NextResponse.redirect(new URL("/dashboard", siteUrl()));
    const params = request.nextUrl.searchParams;
    if (params.get("state") !== flow.state)
      return finish("error", "The connection to Gumroad expired. Try again.");
    if (params.get("error"))
      return finish("error", "Gumroad access was not approved, so nothing was connected.");
    const code = params.get("code");
    if (!code) return finish("error", "Gumroad did not complete the connection. Try again.");
    const app = gumroadClient();
    if (!app) return finish("error", "Gumroad is not set up on this server yet.");
    const { data: owned } = await client
      .from("saas")
      .select("id")
      .eq("id", flow.saasId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!owned) throw new VerificationError("You can only verify revenue for your own SaaS.");
    // Counts against the same limits as any check a founder starts.
    const { error } = await client.rpc("begin_revenue_check", {
      p_saas: flow.saasId,
      p_refresh: false,
    });
    if (error?.code === "P0001") throw new VerificationError(`${error.message}.`);
    if (error) throw new Error(`The revenue check could not start: ${error.message}`);
    const { token, hint } = await exchangeGumroadCode(app, code, flow.verifier);
    const result = await connectProvider(flow.saasId, "gumroad", {
      key: token,
      hint,
      livemode: true,
    });
    // A verification may reach a milestone, which queues an email.
    sendQueuedEmails();
    revalidatePath("/", "layout");
    return finish("success", `Gumroad connected. ${summary(result)}`);
  } catch (error) {
    unstable_rethrow(error);
    return finish("error", makerMessage(error));
  }
}
