import { getTranslations } from "next-intl/server";
import { oauthError, PROVIDER_NAMES } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH, safeNext } from "@/lib/domain";
import type { SearchParams } from "@/lib/params";
import { firstValues } from "@/lib/params";
import { supabaseConfig } from "@/lib/supabase/config";
import { enabledProviders } from "@/lib/supabase/providers";
import { AuthForm } from "./forms";
import { Notice } from "./shell";

// Sign-in, sign-up and password forms, shared by the /auth page and the sign-in dialog that
// opens over the current page when a link to /auth is followed inside the site. Their Client
// Components need the auth messages, which the page and the dialog pass to the browser.

export type AuthMode = "login" | "signup" | "reset" | "update";

export function authMode(value: string | undefined): AuthMode {
  return value === "signup" || value === "reset" || value === "update" ? value : "login";
}

/**
 * The heading of a form, saying why sign-in is asked for when a visitor came from something that
 * needs an account, such as writing to a founder. `next` is already checked with safeNext(). Each
 * description fits on one line at the form's width, so every form starts at the same height.
 */
export async function authHeading(mode: AuthMode, next: string | null) {
  const t = await getTranslations("auth.headings");
  const title = t(`${mode}.title`);
  const reason = next?.startsWith("/messages")
    ? "Message"
    : next?.startsWith("/report/")
      ? "Report"
      : null;
  if (reason && (mode === "login" || mode === "signup"))
    return { title, description: t(`${mode}To${reason}`) };
  return {
    title,
    description:
      mode === "update"
        ? t("update.description", { min: PASSWORD_MIN_LENGTH })
        : t(`${mode}.description`),
  };
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
  const failure = oauthError(params.error, params.provider);
  const [t, errors, providers] = await Promise.all([
    getTranslations("auth.panel"),
    getTranslations("auth.oauthErrors"),
    mode === "login" || mode === "signup" ? enabledProviders() : [],
  ]);
  return (
    <div className="grid gap-5">
      {failure && (
        <Notice tone="error">
          {failure.provider
            ? errors(`named.${failure.error}`, { provider: PROVIDER_NAMES[failure.provider] })
            : errors(`unnamed.${failure.error}`)}
        </Notice>
      )}
      {supabaseConfig() ? (
        // Keyed by the form, so switching between sign-in, sign-up and reset, which changes only
        // the query, starts a fresh form instead of carrying over the last one's result.
        <AuthForm key={mode} mode={mode} next={safeNext(params.next)} providers={providers} />
      ) : (
        <Notice tone="error">{t("notConfigured")}</Notice>
      )}
      {inbox && mode !== "update" && (
        <Notice>
          {t.rich("localInbox", {
            link: (chunks) => (
              <a href={inbox} target="_blank" rel="noreferrer" className="font-medium underline">
                {chunks}
              </a>
            ),
          })}
        </Notice>
      )}
    </div>
  );
}
