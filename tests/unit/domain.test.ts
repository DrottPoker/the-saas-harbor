import { describe, expect, it } from "vitest";
import {
  containsPattern,
  emailLink,
  formatUsd,
  profileSchema,
  saasSchema,
} from "../../src/lib/domain";

describe("email links", () => {
  const hash = "0f".repeat(28);
  it("accepts the token hashes of confirmation and recovery links", () => {
    expect(emailLink(hash, "email")).toEqual({ tokenHash: hash, type: "email" });
    expect(emailLink(`pkce_${hash}`, "recovery")).toEqual({
      tokenHash: `pkce_${hash}`,
      type: "recovery",
    });
  });
  it.each([
    [hash, "magiclink"],
    [hash, "signup"],
    [hash, undefined],
    [undefined, "email"],
    ["short", "email"],
    [`${hash}&type=recovery`, "email"],
    ["x".repeat(201), "email"],
  ])("refuses %s with type %s", (tokenHash, type) => expect(emailLink(tokenHash, type)).toBeNull());
});

describe("name search pattern", () => {
  it("wraps a trimmed term in wildcards", () =>
    expect(containsPattern("  Harbor ")).toBe("%Harbor%"));
  it.each([
    ["a*b", "%ab%"],
    ["50%_off", "%50off%"],
    ["back\\slash", "%backslash%"],
  ])("strips user wildcards from %s", (input, expected) =>
    expect(containsPattern(input)).toBe(expected),
  );
  it("skips blank and wildcard-only input", () => {
    expect(containsPattern("   ")).toBeNull();
    expect(containsPattern("*%_")).toBeNull();
  });
  it("limits the term length", () => expect(containsPattern("x".repeat(200))).toHaveLength(82));
});

describe("USD display", () => {
  it("shows cents only when present", () => {
    expect(formatUsd(1999)).toBe("$19.99");
    expect(formatUsd(840000)).toBe("$8,400");
  });
});
describe("profile boundaries", () => {
  it.each(["javascript:alert(1)", "data:text/html,test", "https://user:password@example.com"])(
    "rejects unsafe link %s",
    (website) =>
      expect(
        profileSchema.safeParse({ name: "Maker", bio: "", website, social_url: "" }).success,
      ).toBe(false),
  );
  const product = {
    id: crypto.randomUUID(),
    name: "Test",
    tagline: "Test product",
    description: "A sufficiently detailed product description.",
    category: "Other",
    website: "https://example.com",
    launched_on: "2026-01-15",
    share_mrr: true,
    share_customers: false,
    share_launch: false,
  };
  it("rejects invalid calendar dates", () =>
    expect(saasSchema.safeParse({ ...product, launched_on: "2026-02-30" }).success).toBe(false));
  it("takes launch dates from 1970 until today, wherever today is", () => {
    const launched = (launched_on: string) =>
      saasSchema.safeParse({ ...product, launched_on }).success;
    expect(launched("0000-01-01")).toBe(false);
    expect(launched("1969-12-31")).toBe(false);
    expect(launched("1970-01-01")).toBe(true);
    expect(launched(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10))).toBe(false);
    expect(launched(new Date().toISOString().slice(0, 10))).toBe(true);
  });
  it("never accepts revenue from the form", () => {
    const parsed = saasSchema.parse({ ...product, mrr: "99999", mrr_cents: 1, customers: "5" });
    expect(parsed).not.toHaveProperty("mrr");
    expect(parsed).not.toHaveProperty("mrr_cents");
    expect(parsed).not.toHaveProperty("customers");
  });
});
