import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { recordAccountSource } from "@/lib/account-source";
import { decodeOAuthFlow, OAUTH_FLOW_COOKIE, oauthFailure } from "@/lib/auth";
import {
  hasFinishedSignup,
  recordSignInCountry,
  serverClient,
  startPage,
} from "@/lib/supabase/server";

// Google and GitHub return here through Supabase with a one-time code, which becomes the session
// in this browser. New accounts continue to choosing a username and accepting the Terms.
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const store = await cookies();
  const flow = decodeOAuthFlow(store.get(OAUTH_FLOW_COOKIE)?.value);
  store.delete({ name: OAUTH_FLOW_COOKIE, path: "/auth" });
  const provider = flow.provider ? `&provider=${flow.provider}` : "";
  const search = request.nextUrl.searchParams;
  // A cancelled confirmation leaves the current session as it was.
  const failed = (reason: string) =>
    to(
      flow.confirm
        ? "/dashboard/settings?confirm=failed#delete-account"
        : `/auth?error=${reason}${provider}`,
    );
  const code = search.get("code");
  if (!code) return failed(oauthFailure(search.get("error_code"), search.get("error_description")));
  const client = await serverClient();
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.user) return failed("failed");
  if (flow.confirm) {
    if (data.user.id === flow.confirm) return to("/dashboard/settings#delete-account");
    // Another account signed in, possibly into another profile: nothing is deleted.
    await client.auth.signOut({ scope: "local" });
    return to(`/auth?error=account${provider}`);
  }
  await recordSignInCountry(client);
  // An account made by this sign-in keeps the source of the visit that led to it.
  if (Date.parse(data.user.created_at) > Date.now() - 60 * 60 * 1000)
    await recordAccountSource(data.user.id);
  if (!(await hasFinishedSignup(client, data.user)))
    return to(flow.next ? `/auth/finish?next=${encodeURIComponent(flow.next)}` : "/auth/finish");
  return to(flow.next ?? (await startPage(client, data.user.id)));
}
