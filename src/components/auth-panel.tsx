import { oauthError } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH, safeNext } from "@/lib/domain";
import type { SearchParams } from "@/lib/params";
import { firstValues } from "@/lib/params";
import { supabaseConfig } from "@/lib/supabase/config";
import { enabledProviders } from "@/lib/supabase/providers";
import { AuthForm } from "./forms";
import { Notice } from "./shell";

// Sign-in, sign-up and password forms, shared by the /auth page and the sign-in dialog that
// opens over the current page when a link to /auth is followed inside the site.

export type AuthMode = "login" | "signup" | "reset" | "update";

// Each description fits on one line at the form's width, so every form starts at the same height.
export const authHeadings: Record<AuthMode, { title: string; description: string }> = {
  login: { title: "Sign in", description: "Welcome back. Sign in to manage your products." },
  signup: {
    title: "Create your account",
    description: "Free to list. You choose what to share.",
  },
  reset: {
    title: "Reset your password",
    description: "We will email you a link to set a new password.",
  },
  update: {
    title: "Choose a new password",
    description: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  },
};

export function authMode(value: string | undefined): AuthMode {
  return value === "signup" || value === "reset" || value === "update" ? value : "login";
}

// Set by scripts/local-env.mjs during local development only. Never shown for a remote address.
function localInbox() {
  const value = process.env.LOCAL_MAILPIT_URL;
  try {
    return value && ["127.0.0.1", "localhost"].includes(new URL(value).hostname) ? value : null;
  } catch {
    return null;
  }
}

/** The form for the mode in the address, with any sign-in error above it. */
export async function AuthPanel({ searchParams }: { searchParams: SearchParams }) {
  const params = firstValues(searchParams);
  const mode = authMode(params.mode);
  const inbox = localInbox();
  const error = oauthError(params.error, params.provider);
  const providers = mode === "login" || mode === "signup" ? await enabledProviders() : [];
  return (
    <div className="grid gap-5">
      {error && <Notice tone="error">{error}</Notice>}
      {supabaseConfig() ? (
        <AuthForm mode={mode} next={safeNext(params.next)} providers={providers} />
      ) : (
        <Notice tone="error">
          Authentication is not configured. Follow the Supabase setup in README.md.
        </Notice>
      )}
      {inbox && mode !== "update" && (
        <Notice>
          Local development: confirmation and reset emails are not sent to real inboxes.{" "}
          <a href={inbox} target="_blank" rel="noreferrer" className="font-medium underline">
            Open the local inbox
          </a>
        </Notice>
      )}
    </div>
  );
}
