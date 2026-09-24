import { AuthForm } from "@/components/forms";
import { Anchor } from "lucide-react";
import { supabaseConfig } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/server";
export const metadata = { title: "Welcome aboard" };
export default async function Auth({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const mode =
    params.mode === "signup" || params.mode === "reset" || params.mode === "update"
      ? params.mode
      : "login";
  if (mode === "update") await requireUser();
  return (
    <div className="auth-shell">
      <div className="auth-aside">
        <Anchor size={48} strokeWidth={1.3} />
        <p className="eyebrow">WELCOME TO THE HARBOR</p>
        <h1>
          A place for
          <br />
          your next chapter<span className="coral">.</span>
        </h1>
        <p>
          Share what you&apos;re building.
          <br />
          Let people discover your story.
        </p>
        <span className="auth-aside-bottom">INDEPENDENT BY SPIRIT. TOGETHER BY CHOICE.</span>
      </div>
      <section className="auth-main">
        <p className="eyebrow">YOUR JOURNEY STARTS HERE</p>
        <h2>
          {mode === "login"
            ? "Welcome back."
            : mode === "signup"
              ? "Come aboard."
              : mode === "reset"
                ? "A fresh start."
                : "Set a new password."}
        </h2>
        <p className="muted">
          {mode === "login"
            ? "Sign in to your corner of the harbor."
            : mode === "signup"
              ? "Create your free maker account."
              : "Let’s get you back to building."}
        </p>
        {params.callback_error && (
          <p className="notice error">
            This link has expired or was opened in another browser. Try signing in or request a new
            reset link.
          </p>
        )}
        {supabaseConfig() ? (
          <AuthForm mode={mode} />
        ) : (
          <p className="notice error">
            Authentication is not configured. Follow the Supabase setup in README.md.
          </p>
        )}
      </section>
    </div>
  );
}
