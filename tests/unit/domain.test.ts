import { describe, expect, it } from "vitest";
import {
  containsPattern,
  parseUsd,
  usdInput,
  formatUsd,
  profileSchema,
  saasSchema,
} from "../../src/lib/domain";

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

describe("exact USD amounts", () => {
  it.each([
    ["0", 0],
    ["0.01", 1],
    ["19.99", 1999],
    ["9999999999.99", 999999999999],
    ["1.1", 110],
  ])("stores %s exactly", (input, expected) => expect(parseUsd(input as string)).toBe(expected));
  it("keeps omitted MRR distinct from zero", () => {
    expect(parseUsd("")).toBeNull();
    expect(parseUsd("0")).toBe(0);
  });
  it.each(["1.001", "-1", "NaN", "1e5", "Infinity", "10,000", "10000000000", "0xFF"])(
    "rejects %s",
    (input) => expect(() => parseUsd(input)).toThrow(),
  );
  it("round-trips cent values", () => {
    for (const cents of [0, 1, 9, 101, 1999, 100000001, 999999999999])
      expect(parseUsd(usdInput(cents))).toBe(cents);
  });
  it("displays cents without dropping precision", () => expect(formatUsd(1999)).toBe("$19.99"));
});
describe("profile boundaries", () => {
  it.each(["javascript:alert(1)", "data:text/html,test", "https://user:password@example.com"])(
    "rejects unsafe link %s",
    (website) =>
      expect(
        profileSchema.safeParse({ name: "Maker", bio: "", website, social_url: "" }).success,
      ).toBe(false),
  );
  it("rejects invalid calendar dates", () => {
    const input = {
      id: crypto.randomUUID(),
      name: "Test",
      tagline: "Test product",
      description: "A sufficiently detailed product description.",
      category: "Other",
      website: "https://example.com",
      mrr: "",
      customers: "",
      launched_on: "2026-02-30",
      public_mrr: false,
      public_customers: false,
      public_launch: false,
    };
    expect(saasSchema.safeParse(input).success).toBe(false);
  });
});
