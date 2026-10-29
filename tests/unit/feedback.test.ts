import { describe, expect, it } from "vitest";
import { safeNext } from "../../src/lib/domain";
import {
  FEEDBACK_ERRORS,
  feedbackHref,
  feedbackOpening,
  feedbackPage,
  feedbackSchema,
} from "../../src/lib/feedback";
import en from "../../src/messages/en";
import { userErrorsOf } from "./support/migrations";

describe("feedback", () => {
  it("keeps only paths on this site as the page it came from", () => {
    expect(feedbackPage("/saas/metricfold")).toBe("/saas/metricfold");
    expect(feedbackPage("/")).toBe("/");
    for (const other of ["//evil.example", "/\\evil.example", "https://evil.example", "stats", ""])
      expect(feedbackPage(other)).toBeNull();
    expect(feedbackPage(`/${"a".repeat(300)}`)).toBeNull();
  });

  it("refuses tabs, line breaks, spaces and backslashes, which browsers read their own way", () => {
    // A browser drops the tab, so /<tab>/evil.example would be a link to evil.example.
    for (const other of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example"])
      expect(feedbackPage(other)).toBeNull();
    expect(feedbackPage("/saas/a b")).toBeNull();
    expect(feedbackPage("/saas/a\\b")).toBeNull();
    expect(feedbackPage("/saas/a%20b")).toBe("/saas/a%20b");
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

  it("opens in a dialog, except after the full sign-in page and over the form itself", () => {
    for (const from of ["/stats", "/saas/metricfold?x=1", "/", "/authors", null])
      expect(feedbackOpening(from)).toBe("dialog");
    for (const from of ["/auth", "/auth?next=%2Ffeedback", "/auth/finish"])
      expect(feedbackOpening(from)).toBe("page");
    expect(feedbackOpening("/feedback?from=%2Fstats")).toBe("none");
  });

  it("opens the same way in every language", () => {
    for (const from of ["/es", "/ar/stats", "/zh?by=all", "/esx/auth"])
      expect(feedbackOpening(from), from).toBe("dialog");
    for (const from of ["/es/auth", "/ru/auth/finish"]) expect(feedbackOpening(from)).toBe("page");
    expect(feedbackOpening("/hi/feedback")).toBe("none");
  });

  it("has a message for every error the database gives users, worded as the database does", () => {
    const raised = [...userErrorsOf("submit_feedback"), ...userErrorsOf("submit_visitor_feedback")];
    expect([...FEEDBACK_ERRORS.keys()].sort()).toEqual([...new Set(raised)].sort());
    for (const [text, key] of FEEDBACK_ERRORS)
      expect(en.feedback.errors[key].replace("{min}", "10").replace("{max}", "2,000"), key).toBe(
        `${text}.`,
      );
  });

  it("needs a kind and some text", () => {
    expect(feedbackSchema.safeParse({ kind: "bug", message: "  Too short " }).success).toBe(false);
    expect(
      feedbackSchema.parse({ kind: "suggestion", message: " A dark badge, please. ", email: "" }),
    ).toEqual({ kind: "suggestion", message: "A dark badge, please.", email: "" });
    expect(
      feedbackSchema.safeParse({ kind: "praise", message: "Lovely site overall.", email: "" })
        .success,
    ).toBe(false);
  });

  it("takes a visitor's address for a reply, or none", () => {
    const feedback = { kind: "bug", message: "Sign-up says my email is invalid." };
    expect(feedbackSchema.parse({ ...feedback, email: " jane@example.com " }).email).toBe(
      "jane@example.com",
    );
    for (const email of ["jane", "jane@", `${"a".repeat(250)}@example.com`])
      expect(feedbackSchema.safeParse({ ...feedback, email }).success, email).toBe(false);
  });
});
