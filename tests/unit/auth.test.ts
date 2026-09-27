import { describe, expect, it } from "vitest";
import {
  confirmationMethod,
  createdWithGoogle,
  decodeOAuthFlow,
  encodeOAuthFlow,
  GOOGLE_ERRORS,
  googleError,
  signedInWithin,
} from "../../src/lib/auth";

const now = Date.UTC(2026, 8, 27, 12);
const at = (secondsAgo: number) => now / 1000 - secondsAgo;

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
  it("asks accounts with only Google to confirm with Google", () => {
    expect(confirmationMethod({ identities: [{ provider: "google" }] as never })).toBe("google");
  });
  it("asks for the password when the account has one, or when unsure", () => {
    expect(
      confirmationMethod({ identities: [{ provider: "email" }, { provider: "google" }] as never }),
    ).toBe("password");
    expect(confirmationMethod({ identities: [{ provider: "email" }] as never })).toBe("password");
    expect(confirmationMethod({ identities: [] })).toBe("password");
    expect(confirmationMethod({})).toBe("password");
  });
});

describe("createdWithGoogle", () => {
  it("follows the provider the account was created with", () => {
    expect(createdWithGoogle({ app_metadata: { provider: "google" } })).toBe(true);
    expect(
      createdWithGoogle({ app_metadata: { provider: "email", providers: ["email", "google"] } }),
    ).toBe(false);
    expect(createdWithGoogle({ app_metadata: {} })).toBe(false);
  });
});

describe("the Google sign-in flow cookie", () => {
  const user = "b0000000-0000-4000-8000-000000000001";
  it("keeps where to continue and which account confirms", () => {
    const flow = { next: "/messages", confirm: user };
    expect(decodeOAuthFlow(encodeOAuthFlow(flow))).toEqual(flow);
  });
  it("drops anything unsafe or damaged", () => {
    expect(
      decodeOAuthFlow(JSON.stringify({ next: "https://evil.example", confirm: "not-a-user" })),
    ).toEqual({ next: null, confirm: null });
    expect(decodeOAuthFlow(JSON.stringify({ next: "//evil.example", confirm: 42 }))).toEqual({
      next: null,
      confirm: null,
    });
    expect(decodeOAuthFlow("{")).toEqual({ next: null, confirm: null });
    expect(decodeOAuthFlow("null")).toEqual({ next: null, confirm: null });
    expect(decodeOAuthFlow(undefined)).toEqual({ next: null, confirm: null });
  });
});

describe("googleError", () => {
  it("shows only known errors", () => {
    expect(googleError("google")).toBe(GOOGLE_ERRORS.google);
    expect(googleError("account")).toBe(GOOGLE_ERRORS.account);
    expect(googleError("toString")).toBeNull();
    expect(googleError("<script>")).toBeNull();
    expect(googleError(undefined)).toBeNull();
  });
});
