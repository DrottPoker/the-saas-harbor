// Rules for signing in with Google next to email and password. Pure, so they are unit-tested.
import type { User } from "@supabase/supabase-js";
import { safeNext } from "./domain";

/**
 * Whether a session's amr claim holds a sign-in with this method in the last `seconds`: password,
 * otp (an email link) or oauth (Google).
 */
export function signedInWithin(amr: unknown, method: string, seconds: number, now = Date.now()) {
  const since = now / 1000 - seconds;
  return (
    Array.isArray(amr) &&
    amr.some((entry) => entry?.method === method && Number(entry?.timestamp) >= since)
  );
}

/** How the user confirms who they are before deleting their account. */
export function confirmationMethod(user: Pick<User, "identities">): "password" | "google" {
  const identities = user.identities ?? [];
  return identities.length && identities.every((identity) => identity.provider === "google")
    ? "google"
    : "password";
}

/**
 * Whether the account was created through Google, so it chooses a username and accepts the Terms
 * after its first sign-in. Accounts created with an email address did both at sign-up.
 */
export function createdWithGoogle(user: Pick<User, "app_metadata">) {
  return user.app_metadata?.provider === "google";
}

// A Google sign-in remembers, in a short-lived cookie, where it continues afterwards, and for a
// confirmation before deleting the account, which account has to come back.
export const OAUTH_FLOW_COOKIE = "harbor-oauth-flow";
export const OAUTH_FLOW_SECONDS = 10 * 60;

export type OAuthFlow = { next: string | null; confirm: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeOAuthFlow(flow: OAuthFlow) {
  return JSON.stringify(flow);
}

export function decodeOAuthFlow(value: string | undefined): OAuthFlow {
  try {
    const parsed: unknown = JSON.parse(value ?? "");
    if (parsed && typeof parsed === "object") {
      const { next, confirm } = parsed as Record<string, unknown>;
      return {
        next: typeof next === "string" ? safeNext(next) : null,
        confirm: typeof confirm === "string" && UUID.test(confirm) ? confirm : null,
      };
    }
  } catch {
    // A missing or damaged cookie continues like a plain sign-in.
  }
  return { next: null, confirm: null };
}

// Why a Google sign-in stopped, shown on the sign-in page from its error parameter.
export const GOOGLE_ERRORS = {
  google: "Signing in with Google did not finish. Try again, or use your email address.",
  unavailable: "Signing in with Google is not available right now. Use your email address.",
  account:
    "You confirmed with a different Google account, so you were signed out. Sign in again with the account you want to delete.",
} as const;

export function googleError(value: string | undefined) {
  return value && Object.hasOwn(GOOGLE_ERRORS, value)
    ? GOOGLE_ERRORS[value as keyof typeof GOOGLE_ERRORS]
    : null;
}
