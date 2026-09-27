import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { encodeOAuthFlow, OAUTH_FLOW_COOKIE, OAUTH_FLOW_SECONDS } from "@/lib/auth";
import { safeNext } from "@/lib/domain";
import { cookieOptions } from "@/lib/supabase/config";
import { googleSignInEnabled } from "@/lib/supabase/providers";
import { currentUser, serverClient } from "@/lib/supabase/server";

// Starts a sign-in with Google. Buttons link here rather than submit a form, so the redirects to
// Supabase and Google are plain navigations, which the form-action policy does not cover. With
// ?confirm=delete, the signed-in user signs in again before deleting their account.
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!(await googleSignInEnabled())) return to("/auth?error=unavailable");
  const confirming = request.nextUrl.searchParams.get("confirm") === "delete";
  const user = confirming ? await currentUser() : null;
  if (confirming && !user) return to("/auth");
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
  const client = await serverClient();
  // The code verifier for the exchange afterwards goes into a cookie on this response.
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${site}/auth/callback`,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: "select_account",
        ...(user?.email ? { login_hint: user.email } : {}),
      },
    },
  });
  if (error || !data.url)
    return to(confirming ? "/dashboard/profile#delete-account" : "/auth?error=google");
  (await cookies()).set(
    OAUTH_FLOW_COOKIE,
    encodeOAuthFlow({
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
