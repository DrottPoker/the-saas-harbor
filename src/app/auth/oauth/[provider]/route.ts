import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  encodeOAuthFlow,
  isOAuthProvider,
  OAUTH_FLOW_COOKIE,
  OAUTH_FLOW_SECONDS,
} from "@/lib/auth";
import { safeNext } from "@/lib/domain";
import { cookieOptions } from "@/lib/supabase/config";
import { enabledProviders } from "@/lib/supabase/providers";
import { currentUser, serverClient } from "@/lib/supabase/server";

// Starts a sign-in with Google or GitHub. Buttons link here rather than submit a form, so the
// redirects to Supabase and the provider are plain navigations, which the form-action policy does
// not cover. With ?confirm=delete, the signed-in user signs in again before deleting their account.
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/auth/oauth/[provider]">,
) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const { provider } = await params;
  if (!isOAuthProvider(provider)) return to("/auth");
  if (!(await enabledProviders()).includes(provider))
    return to(`/auth?error=unavailable&provider=${provider}`);
  const confirming = request.nextUrl.searchParams.get("confirm") === "delete";
  const user = confirming ? await currentUser() : null;
  if (confirming && !user) return to("/auth");
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
  const client = await serverClient();
  // The code verifier for the exchange afterwards goes into a cookie on this response.
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${site}/auth/callback`,
      skipBrowserRedirect: true,
      // Google lets the user choose an account, starting with the one being confirmed.
      queryParams:
        provider === "google"
          ? { prompt: "select_account", ...(user?.email ? { login_hint: user.email } : {}) }
          : undefined,
    },
  });
  if (error || !data.url)
    return to(
      confirming
        ? "/dashboard/profile?confirm=failed#delete-account"
        : `/auth?error=failed&provider=${provider}`,
    );
  (await cookies()).set(
    OAUTH_FLOW_COOKIE,
    encodeOAuthFlow({
      provider,
      next: confirming ? null : safeNext(request.nextUrl.searchParams.get("next")),
      confirm: user?.id ?? null,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieOptions.secure,
      maxAge: OAUTH_FLOW_SECONDS,
      path: "/auth",
    },
  );
  return NextResponse.redirect(data.url);
}
