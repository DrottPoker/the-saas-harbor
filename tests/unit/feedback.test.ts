import { describe, expect, it } from "vitest";
import { safeNext } from "../../src/lib/domain";
import { feedbackHref, feedbackPage, feedbackSchema } from "../../src/lib/feedback";

describe("feedback", () => {
  it("keeps only paths on this site as the page it came from", () => {
    expect(feedbackPage("/saas/metricfold")).toBe("/saas/metricfold");
    expect(feedbackPage("/")).toBe("/");
    for (const other of ["//evil.example", "/\\evil.example", "https://evil.example", "stats", ""])
      expect(feedbackPage(other)).toBeNull();
    expect(feedbackPage(`/${"a".repeat(300)}`)).toBeNull();
  });

  it("links to the form with the page, which sign-in may continue to", () => {
    const href = feedbackHref("/users/jane-doe");
    expect(href).toBe("/feedback?from=%2Fusers%2Fjane-doe");
    expect(safeNext(href)).toBe(href);
    expect(feedbackHref("/feedback")).toBe("/feedback");
    expect(feedbackHref("//evil.example")).toBe("/feedback");
    expect(safeNext("/feedback?from=https%3A%2F%2Fevil.example")).toBeNull();
    expect(safeNext("/feedback?from=%2F&next=x")).toBeNull();
  });

  it("needs a kind and some text", () => {
    expect(feedbackSchema.safeParse({ kind: "bug", message: "  Too short " }).success).toBe(false);
    expect(
      feedbackSchema.parse({ kind: "suggestion", message: " A dark badge, please. " }),
    ).toEqual({ kind: "suggestion", message: "A dark badge, please." });
    expect(
      feedbackSchema.safeParse({ kind: "praise", message: "Lovely site overall." }).success,
    ).toBe(false);
  });
});
