import { describe, expect, it } from "vitest";
import {
  confirmationMethod,
  createdWithProvider,
  decodeOAuthFlow,
  encodeOAuthFlow,
  oauthError,
  oauthFailure,
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

describe("createdWithProvider", () => {
  it("follows the provider the account was created with", () => {
    expect(createdWithProvider({ app_metadata: { provider: "google" } })).toBe(true);
    expect(createdWithProvider({ app_metadata: { provider: "github" } })).toBe(true);
    expect(
      createdWithProvider({ app_metadata: { provider: "email", providers: ["email", "github"] } }),
    ).toBe(false);
    expect(createdWithProvider({ app_metadata: { provider: "apple" } })).toBe(false);
    expect(createdWithProvider({ app_metadata: {} })).toBe(false);
  });
});

describe("the sign-in flow cookie", () => {
  const user = "b0000000-0000-4000-8000-000000000001";
  const empty = { provider: null, next: null, confirm: null };
  it("keeps the provider, where to continue and which account confirms", () => {
    const flow = { provider: "github" as const, next: "/messages", confirm: user };
    expect(decodeOAuthFlow(encodeOAuthFlow(flow))).toEqual(flow);
  });
  it("drops anything unsafe or damaged", () => {
    expect(
      decodeOAuthFlow(
        JSON.stringify({ provider: "apple", next: "https://evil.example", confirm: "not-a-user" }),
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
  it("names the provider in known errors only", () => {
    expect(oauthError("failed", "github")).toBe(
      "Signing in with GitHub did not finish. Try again, or use your email address.",
    );
    expect(oauthError("email", "github")).toContain("Verify your email address with GitHub");
    expect(oauthError("unavailable", "google")).toContain("Signing in with Google is not");
    expect(oauthError("account", "<b>")).toContain("a different account at that service");
    expect(oauthError("toString", "google")).toBeNull();
    expect(oauthError("<script>", "google")).toBeNull();
    expect(oauthError(undefined, "google")).toBeNull();
  });
});
