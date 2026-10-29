import { describe, expect, it } from "vitest";
import { getTranslations } from "next-intl/server";
import {
  authNeedsFullPage,
  confirmationMethod,
  decodeOAuthFlow,
  encodeOAuthFlow,
  oauthError,
  oauthFailure,
  oauthStartPath,
  signedInWithin,
} from "../../src/lib/auth";

const now = Date.UTC(2026, 8, 27, 12);
const at = (secondsAgo: number) => now / 1000 - secondsAgo;
const identities = (...providers: string[]) => providers.map((provider) => ({ provider })) as never;

describe("signedInWithin", () => {
  it("finds a recent sign-in with the method", () => {
    const amr = [
      { method: "password", timestamp: at(3600) },
      { method: "oauth", timestamp: at(60) },
    ];
    expect(signedInWithin(amr, "oauth", 300, now)).toBe(true);
    expect(signedInWithin(amr, "password", 300, now)).toBe(false);
  });
  it("ignores older sign-ins, other methods and anything that is not a list", () => {
    expect(signedInWithin([{ method: "oauth", timestamp: at(301) }], "oauth", 300, now)).toBe(
      false,
    );
    expect(signedInWithin([{ method: "otp", timestamp: at(0) }], "oauth", 300, now)).toBe(false);
    expect(signedInWithin([{ method: "oauth", timestamp: "soon" }], "oauth", 300, now)).toBe(false);
    expect(signedInWithin([null], "oauth", 300, now)).toBe(false);
    expect(signedInWithin(undefined, "oauth", 300, now)).toBe(false);
    expect(signedInWithin("oauth", "oauth", 300, now)).toBe(false);
  });
});

describe("confirmationMethod", () => {
  it("asks accounts without a password to confirm with their provider", () => {
    expect(confirmationMethod({ identities: identities("google") })).toBe("google");
    expect(confirmationMethod({ identities: identities("github") })).toBe("github");
    expect(confirmationMethod({ identities: identities("github", "google") })).toBe("github");
  });
  it("asks for the password when the account has one, or when unsure", () => {
    expect(confirmationMethod({ identities: identities("email", "google") })).toBe("password");
    expect(confirmationMethod({ identities: identities("email", "github") })).toBe("password");
    expect(confirmationMethod({ identities: identities("email") })).toBe("password");
    expect(confirmationMethod({ identities: identities("apple") })).toBe("password");
    expect(confirmationMethod({ identities: [] })).toBe("password");
    expect(confirmationMethod({})).toBe("password");
  });
});

describe("the address that starts a sign-in with a provider", () => {
  it("carries where sign-in continues, a confirmation and the page's language", () => {
    expect(oauthStartPath("google", { locale: "en" })).toBe("/auth/oauth/google");
    expect(oauthStartPath("github", { next: "/messages", locale: "en" })).toBe(
      "/auth/oauth/github?next=%2Fmessages",
    );
    expect(oauthStartPath("google", { next: "/messages", locale: "es" })).toBe(
      "/auth/oauth/google?next=%2Fmessages&locale=es",
    );
    expect(oauthStartPath("github", { confirm: true, locale: "ar" })).toBe(
      "/auth/oauth/github?confirm=delete&locale=ar",
    );
  });
});

describe("the sign-in flow cookie", () => {
  const user = "b0000000-0000-4000-8000-000000000001";
  const empty = { provider: null, next: null, confirm: null, locale: null };
  it("keeps the provider, where to continue, which account confirms and the language", () => {
    const flow = {
      provider: "github" as const,
      next: "/messages",
      confirm: user,
      locale: "zh" as const,
    };
    expect(decodeOAuthFlow(encodeOAuthFlow(flow))).toEqual(flow);
  });
  it("drops anything unsafe or damaged", () => {
    expect(
      decodeOAuthFlow(
        JSON.stringify({
          provider: "apple",
          next: "https://evil.example",
          confirm: "not-a-user",
          locale: "fr",
        }),
      ),
    ).toEqual(empty);
    expect(decodeOAuthFlow(JSON.stringify({ next: "//evil.example", confirm: 42 }))).toEqual(empty);
    expect(decodeOAuthFlow("{")).toEqual(empty);
    expect(decodeOAuthFlow("null")).toEqual(empty);
    expect(decodeOAuthFlow(undefined)).toEqual(empty);
  });
});

describe("oauthFailure", () => {
  it("tells a missing verified email address from other failures", () => {
    expect(oauthFailure("provider_email_needs_verification", null)).toBe("email");
    expect(oauthFailure(null, "Error getting user email from external provider")).toBe("email");
    expect(oauthFailure("bad_oauth_state", "OAuth state parameter missing")).toBe("failed");
    expect(oauthFailure(null, null)).toBe("failed");
  });
});

describe("oauthError", () => {
  it("knows its errors and names only known providers", () => {
    expect(oauthError("failed", "github")).toEqual({ error: "failed", provider: "github" });
    expect(oauthError("unavailable", "google")).toEqual({
      error: "unavailable",
      provider: "google",
    });
    expect(oauthError("account", "<b>")).toEqual({ error: "account", provider: null });
    expect(oauthError("email", undefined)).toEqual({ error: "email", provider: null });
    expect(oauthError("toString", "google")).toBeNull();
    expect(oauthError("<script>", "google")).toBeNull();
    expect(oauthError(undefined, "google")).toBeNull();
  });
  it("reads as before in English, with or without the provider's name", async () => {
    const t = await getTranslations({ locale: "en", namespace: "auth.oauthErrors" });
    expect(t("named.failed", { provider: "GitHub" })).toBe(
      "Signing in with GitHub did not finish. Try again, or use your email address.",
    );
    expect(t("named.email", { provider: "GitHub" })).toContain(
      "Verify your email address with GitHub",
    );
    expect(t("named.unavailable", { provider: "Google" })).toContain(
      "Signing in with Google is not",
    );
    expect(t("unnamed.account")).toContain("a different account at that service");
  });
});

describe("the sign-in dialog", () => {
  it("gives way to the full page from pages that need sign-in", () => {
    for (const from of ["/dashboard", "/dashboard/saas/new", "/report/saas/1", "/messages?x=1"])
      expect(authNeedsFullPage(from), from).toBe(true);
    expect(authNeedsFullPage("http://127.0.0.1:3001/admin/reports")).toBe(true);
  });
  it("knows those pages in every language", () => {
    for (const from of ["/es/dashboard", "/ar/messages", "/zh/auth?mode=signup", "/ru/auth/finish"])
      expect(authNeedsFullPage(from), from).toBe(true);
    for (const from of ["/es", "/hi/saas/tidewise", "/fr/dashboard"])
      expect(authNeedsFullPage(from), from).toBe(false);
  });
  it("switches forms as a page on the full sign-in page, rather than opening over it", () => {
    for (const from of ["/auth", "/auth?mode=signup", "/auth/confirm", "/auth/finish"])
      expect(authNeedsFullPage(from), from).toBe(true);
  });
  it("opens over public pages", () => {
    for (const from of [null, "", "/", "/saas/tidewise", "/dashboards", "/reporting", "/authors"])
      expect(authNeedsFullPage(from), String(from)).toBe(false);
  });
});
