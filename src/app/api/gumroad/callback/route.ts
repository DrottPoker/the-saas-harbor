import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { sendQueuedEmails } from "@/lib/email/outbox";
import { beginRevenueCheck, keepConnectionResult } from "@/lib/revenue/connect";
import { connectionResultPath, type ConnectionResult } from "@/lib/revenue/connection-result";
import { makerMessage, VerificationError } from "@/lib/revenue/errors";
import {
  decodeGumroadFlow,
  exchangeGumroadCode,
  GUMROAD_FLOW_COOKIE,
  gumroadClient,
} from "@/lib/revenue/gumroad/oauth";
import { summary } from "@/lib/revenue/summary";
import { connectProvider } from "@/lib/revenue/sync";
import { siteUrl } from "@/lib/seo";
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
  const finish = async (tone: ConnectionResult["tone"], text: string) => {
    await keepConnectionResult({ saasId: flow.saasId, provider: "gumroad", tone, text });
    return NextResponse.redirect(new URL(connectionResultPath(flow.saasId), siteUrl()));
  };
  try {
    const { user, client } = await requireUser();
    if (user.id !== flow.userId) return NextResponse.redirect(new URL("/dashboard", siteUrl()));
    const params = request.nextUrl.searchParams;
    if (params.get("state") !== flow.state)
      return await finish("error", "The connection to Gumroad expired. Try again.");
    if (params.get("error"))
      return await finish("error", "Gumroad access was not approved, so nothing was connected.");
    const code = params.get("code");
    if (!code) return await finish("error", "Gumroad did not complete the connection. Try again.");
    const app = gumroadClient();
    if (!app) return await finish("error", "Gumroad is not set up on this server yet.");
    const { data: owned } = await client
      .from("saas")
      .select("id")
      .eq("id", flow.saasId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!owned) throw new VerificationError("You can only verify revenue for your own SaaS.");
    // Counts against the same limits as any check a founder starts.
    await beginRevenueCheck(client, flow.saasId, false);
    const { token, hint } = await exchangeGumroadCode(app, code, flow.verifier);
    const result = await connectProvider(flow.saasId, "gumroad", {
      key: token,
      hint,
      livemode: true,
    });
    // A verification may reach a milestone, which queues an email.
    sendQueuedEmails();
    revalidatePath("/", "layout");
    return await finish("success", `Gumroad connected. ${summary(result)}`);
  } catch (error) {
    unstable_rethrow(error);
    return await finish("error", makerMessage(error));
  }
}
