// Rules for signing in with Google or GitHub next to email and password. Pure, so they are
// unit-tested.
import type { User } from "@supabase/supabase-js";
import { DEFAULT_LOCALE, isLocale, splitLocale, type Locale } from "@/i18n/config";
import { safeNext } from "./domain";

/** The sign-in providers the site offers, in the order their buttons appear. */
export const OAUTH_PROVIDERS = ["google", "github"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const PROVIDER_NAMES: Record<OAuthProvider, string> = { google: "Google", github: "GitHub" };

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return OAUTH_PROVIDERS.includes(value as OAuthProvider);
}

// Pages that send visitors to /auth before anything else.
const SIGNED_IN_AREAS = [
  "/dashboard",
  "/admin",
  "/messages",
  "/report",
  "/feedback",
  "/auth/finish",
];

/**
 * Whether /auth opened from `from` (the Next-Url of a navigation inside the site) must be the full
 * page rather than the dialog. Such a page sends a visitor to /auth, and a dialog would open over
 * that same page, which sends them to /auth again, without end. The full sign-in page itself
 * switches forms as a page too, rather than opening a dialog over the form it shows.
 */
export function authNeedsFullPage(from: string | null) {
  if (!from) return false;
  let pathname: string;
  try {
    // Pages in other languages are the same pages under a prefix, such as /es/dashboard.
    pathname = splitLocale(new URL(from, "http://site.invalid").pathname).path;
  } catch {
    return false;
  }
  return [...SIGNED_IN_AREAS, "/auth"].some(
    (area) => pathname === area || pathname.startsWith(`${area}/`),
  );
}

/**
 * Whether a session's amr claim holds a sign-in with this method in the last `seconds`: password,
 * otp (an email link) or oauth (Google or GitHub).
 */
export function signedInWithin(amr: unknown, method: string, seconds: number, now = Date.now()) {
  const since = now / 1000 - seconds;
  return (
    Array.isArray(amr) &&
    amr.some((entry) => entry?.method === method && Number(entry?.timestamp) >= since)
  );
}

/**
 * How the user confirms who they are before deleting their account: their password, or for an
 * account without one, signing in again with the provider it uses.
 */
export function confirmationMethod(user: Pick<User, "identities">): "password" | OAuthProvider {
  const providers = (user.identities ?? []).map((identity) => identity.provider);
  const provider = providers.find(isOAuthProvider);
  return provider && !providers.includes("email") ? provider : "password";
}

/**
 * The address that starts a sign-in with a provider: where sign-in continues, or a confirmation
 * before deleting the account, and the page's language, which the way back keeps. The route and
 * the provider's return are shared by every language, so the language travels in the query.
 */
export function oauthStartPath(
  provider: OAuthProvider,
  { next, confirm = false, locale }: { next?: string | null; confirm?: boolean; locale: Locale },
) {
  const query = new URLSearchParams();
  if (confirm) query.set("confirm", "delete");
  if (next) query.set("next", next);
  if (locale !== DEFAULT_LOCALE) query.set("locale", locale);
  return `/auth/oauth/${provider}${query.size ? `?${query}` : ""}`;
}

// A sign-in with a provider remembers, in a short-lived cookie, which provider it went to, where
// it continues afterwards, for a confirmation before deleting the account which account has to
// come back, and the language of the page it started on.
export const OAUTH_FLOW_COOKIE = "harbor-oauth-flow";
export const OAUTH_FLOW_SECONDS = 10 * 60;

export type OAuthFlow = {
  provider: OAuthProvider | null;
  next: string | null;
  confirm: string | null;
  locale: Locale | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeOAuthFlow(flow: OAuthFlow) {
  return JSON.stringify(flow);
}

export function decodeOAuthFlow(value: string | undefined): OAuthFlow {
  try {
    const parsed: unknown = JSON.parse(value ?? "");
    if (parsed && typeof parsed === "object") {
      const { provider, next, confirm, locale } = parsed as Record<string, unknown>;
      return {
        provider: isOAuthProvider(provider) ? provider : null,
        next: typeof next === "string" ? safeNext(next) : null,
        confirm: typeof confirm === "string" && UUID.test(confirm) ? confirm : null,
        locale: isLocale(locale) ? locale : null,
      };
    }
  } catch {
    // A missing or damaged cookie continues like a plain sign-in.
  }
  return { provider: null, next: null, confirm: null, locale: null };
}

/**
 * Why a sign-in with a provider stopped, from the error Supabase Auth returns: the provider gave
 * no verified email address, or anything else.
 */
export function oauthFailure(code: string | null, description: string | null) {
  return code === "provider_email_needs_verification" || /email/i.test(description ?? "")
    ? "email"
    : "failed";
}

// Why a sign-in with a provider stopped, shown on the sign-in page from its error parameter. The
// texts are in auth.oauthErrors.
const OAUTH_ERRORS = ["failed", "email", "unavailable", "account"] as const;
export type OAuthError = (typeof OAUTH_ERRORS)[number];

/** A known sign-in error from the sign-in page's address, and the provider it names, if any. */
export function oauthError(
  error: string | undefined,
  provider: string | undefined,
): { error: OAuthError; provider: OAuthProvider | null } | null {
  if (!OAUTH_ERRORS.includes(error as OAuthError)) return null;
  return { error: error as OAuthError, provider: isOAuthProvider(provider) ? provider : null };
}
