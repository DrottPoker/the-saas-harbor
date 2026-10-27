import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendQueuedEmails } from "@/lib/email/outbox";
import { siteUrl } from "@/lib/seo";
import { cookieOptions } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { providerName } from "./catalog";
import { beginRevenueCheck, keepConnectionResult } from "./connect";
import { connectionResultPath, type ConnectionResult } from "./connection-result";
import { makerMessage, VerificationError } from "./errors";
import {
  decodeOAuthFlow,
  encodeOAuthFlow,
  newOAuthFlow,
  OAUTH_FLOW_SECONDS,
  oauthFlowCookie,
  type OAuthProvider,
} from "./oauth";
import { summary } from "./summary";
import { allowTestKeys, connectProvider } from "./sync";

// The connect and callback routes of every provider connected through OAuth (see `oauth.ts`).
// They live apart from `oauth.ts` because they use `connect.ts` and `sync.ts`, which import the
// providers' own modules; the providers import `oauth.ts`, so keeping the two apart avoids a cycle.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toSite = (path: string) => NextResponse.redirect(new URL(path, siteUrl()));

async function owns(client: SupabaseClient<Database>, saasId: string, userId: string) {
  const { data } = await client
    .from("saas")
    .select("id")
    .eq("id", saasId)
    .eq("owner_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * `GET /api/<id>/connect?saas=<id>`: starts connecting a provider to a product the signed-in
 * founder owns. The product form saves first and then opens this address rather than redirecting
 * from its action, so the redirect to the provider is a plain navigation, which the form-action
 * policy does not cover. The state and the PKCE verifier wait in a cookie for the callback.
 */
export async function startOAuth(request: NextRequest, provider: OAuthProvider) {
  const saasId = request.nextUrl.searchParams.get("saas") ?? "";
  const { user, client } = await requireUser();
  if (!UUID.test(saasId) || !(await owns(client, saasId, user.id))) return toSite("/dashboard");
  const app = provider.client();
  if (!app) {
    await keepConnectionResult({
      saasId,
      provider: provider.id,
      tone: "error",
      text: `${providerName(provider.id)} is not set up on this server yet.`,
    });
    return toSite(connectionResultPath(saasId));
  }
  const flow = newOAuthFlow(saasId, user.id);
  const { name, path } = oauthFlowCookie(provider.id);
  (await cookies()).set(name, encodeOAuthFlow(flow), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieOptions.secure,
    maxAge: OAUTH_FLOW_SECONDS,
    path,
  });
  return NextResponse.redirect(provider.authorizeUrl(app, flow));
}

/**
 * `GET /api/<id>/callback`: the provider sends the founder back here with a code once they approve
 * read access. The code is exchanged only for the founder who started, with the state they started
 * with, and for a product they own. What the exchange returns is verified like any other key before
 * it is stored, and the outcome waits in a cookie for the product's editor. Redirects go to the
 * site's own address, which the provider returned to, so the session cookie goes along.
 */
export async function finishOAuth(request: NextRequest, provider: OAuthProvider) {
  const name = providerName(provider.id);
  const jar = await cookies();
  const cookie = oauthFlowCookie(provider.id);
  const flow = decodeOAuthFlow(jar.get(cookie.name)?.value);
  jar.delete(cookie);
  if (!flow || !UUID.test(flow.saasId)) return toSite("/dashboard");
  const finish = async (tone: ConnectionResult["tone"], text: string) => {
    await keepConnectionResult({ saasId: flow.saasId, provider: provider.id, tone, text });
    return toSite(connectionResultPath(flow.saasId));
  };
  try {
    const { user, client } = await requireUser();
    if (user.id !== flow.userId) return toSite("/dashboard");
    const params = request.nextUrl.searchParams;
    if (params.get("state") !== flow.state)
      return await finish("error", `The connection to ${name} expired. Try again.`);
    if (params.get("error"))
      return await finish("error", `${name} access was not approved, so nothing was connected.`);
    const code = params.get("code");
    if (!code) return await finish("error", `${name} did not complete the connection. Try again.`);
    const app = provider.client();
    if (!app) return await finish("error", `${name} is not set up on this server yet.`);
    if (!(await owns(client, flow.saasId, user.id)))
      throw new VerificationError("You can only verify revenue for your own SaaS.");
    // Counts against the same limits as any check a founder starts.
    await beginRevenueCheck(client, flow.saasId, false);
    const key = await provider.exchange(app, {
      code,
      verifier: flow.verifier,
      params,
      allowTest: allowTestKeys(),
    });
    const result = await connectProvider(flow.saasId, provider.id, key);
    // A verification may reach a milestone, which queues an email.
    sendQueuedEmails();
    revalidatePath("/", "layout");
    return await finish("success", `${name} connected. ${summary(result)}`);
  } catch (error) {
    unstable_rethrow(error);
    return await finish("error", makerMessage(error));
  }
}
