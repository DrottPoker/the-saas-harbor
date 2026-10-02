import { describe, expect, it } from "vitest";
import { productShareText, shareLinks } from "../../src/lib/share";

describe("sharing a product just listed", () => {
  it("writes the post with the tagline under it", () => {
    expect(productShareText("Tidewise", "Plan the tides for your boat club.")).toBe(
      "I just listed Tidewise on The SaaS Harbor.\n\nPlan the tides for your boat club.",
    );
  });

  it("leaves a missing or empty tagline out", () => {
    expect(productShareText("Tidewise", null)).toBe("I just listed Tidewise on The SaaS Harbor.");
    expect(productShareText("Tidewise", "   ")).toBe("I just listed Tidewise on The SaaS Harbor.");
  });

  it("shortens a long tagline, so the post stays within X's limit with its link", () => {
    const text = productShareText("Tidewise", "word ".repeat(80));
    expect(text.length).toBeLessThan(280 - 24);
    expect(text.endsWith("…")).toBe(true);
  });

  it("opens the post on X with the text and the page's address", () => {
    const url = "https://harbor.example/saas/tidewise";
    const { x } = shareLinks(url, productShareText("Tidewise", "A & B"));
    const params = new URL(x).searchParams;
    expect(new URL(x).origin + new URL(x).pathname).toBe("https://x.com/intent/post");
    expect(params.get("text")).toBe("I just listed Tidewise on The SaaS Harbor.\n\nA & B");
    expect(params.get("url")).toBe(url);
  });
});
