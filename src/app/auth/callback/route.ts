import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { decodeOAuthFlow, OAUTH_FLOW_COOKIE } from "@/lib/auth";
import { hasFinishedSignup, serverClient, startPage } from "@/lib/supabase/server";

// Google returns here through Supabase with a one-time code, which becomes the session in this
// browser. New accounts continue to choosing a username and accepting the Terms.
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const store = await cookies();
  const flow = decodeOAuthFlow(store.get(OAUTH_FLOW_COOKIE)?.value);
  store.delete({ name: OAUTH_FLOW_COOKIE, path: "/auth" });
  // A cancelled confirmation leaves the current session as it was.
  const failed = flow.confirm
    ? "/dashboard/profile?google=failed#delete-account"
    : "/auth?error=google";
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return to(failed);
  const client = await serverClient();
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to(failed);
  if (flow.confirm) {
    if (data.user.id === flow.confirm) return to("/dashboard/profile#delete-account");
    // Another Google account signed in, possibly into another profile: nothing is deleted.
    await client.auth.signOut({ scope: "local" });
    return to("/auth?error=account");
  }
  if (!(await hasFinishedSignup(client, data.user)))
    return to(flow.next ? `/auth/finish?next=${encodeURIComponent(flow.next)}` : "/auth/finish");
  return to(flow.next ?? (await startPage(client, data.user.id)));
}
