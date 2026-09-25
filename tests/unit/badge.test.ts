import { describe, expect, it } from "vitest";
import { badgeEmbedCode, badgeSvg, badgeTheme, textWidth } from "../../src/lib/badge";

describe("badge", () => {
  it("shows shared, verified MRR", () => {
    const svg = badgeSvg({ mrrCents: 1_240_000, theme: "light" });
    expect(svg).toContain(">$12,400</text>");
    expect(svg).toContain(">Verified MRR · The SaaS Harbor</text>");
    expect(svg).toContain('aria-label="Verified MRR $12,400 on The SaaS Harbor"');
  });

  it("says only Listed on without a public figure", () => {
    const svg = badgeSvg({ mrrCents: null, theme: "light" });
    expect(svg).toContain(">Listed on</text>");
    expect(svg).toContain(">The SaaS Harbor</text>");
    expect(svg).not.toContain("$");
  });

  it("uses the theme's colors", () => {
    expect(badgeSvg({ mrrCents: 0, theme: "light" })).toContain('fill="#fbfaf8"');
    expect(badgeSvg({ mrrCents: 0, theme: "dark" })).toContain('fill="#22272d"');
    expect(badgeTheme("dark")).toBe("dark");
    expect(badgeTheme("<script>")).toBe("light");
    expect(badgeTheme(null)).toBe("light");
  });

  it("fits its longest line and gives each line its measured width", () => {
    const width = (svg: string) => Number(/ width="(\d+)"/.exec(svg)![1]);
    const largest = badgeSvg({ mrrCents: 999_999_999_999, theme: "light" });
    const label = textWidth("Verified MRR · The SaaS Harbor", 12);
    const figure = textWidth("$9,999,999,999.99", 18, true);
    expect(width(largest)).toBe(46 + Math.max(label, figure) + 14);
    expect(largest).toContain(`textLength="${figure}"`);
    const listed = badgeSvg({ mrrCents: null, theme: "light" });
    expect(width(listed)).toBe(46 + textWidth("The SaaS Harbor", 18, true) + 14);
  });

  it("measures text in Helvetica widths", () => {
    expect(textWidth("0", 1000)).toBe(556);
    expect(textWidth("MRR", 12)).toBe(Math.ceil(((833 + 722 + 722) * 12) / 1000));
    expect(textWidth("i", 100, true)).toBeGreaterThan(textWidth("i", 100));
  });

  it("is valid XML without any maker text", () => {
    const svg = badgeSvg({ mrrCents: 10_400, theme: "dark" });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toMatch(/<script|on\w+=/i);
  });
});

describe("badge embed code", () => {
  const pageUrl = "https://harbor.example/saas/querybird";

  it("links the badge to the product page", () => {
    const code = badgeEmbedCode({ pageUrl, name: "QueryBird", theme: "light" });
    expect(code.html).toBe(
      '<a href="https://harbor.example/saas/querybird"><img src="https://harbor.example/saas/querybird/badge.svg" alt="QueryBird on The SaaS Harbor" height="52"></a>',
    );
    expect(code.markdown).toBe(
      "[![QueryBird on The SaaS Harbor](https://harbor.example/saas/querybird/badge.svg)](https://harbor.example/saas/querybird)",
    );
  });

  it("asks for the dark theme", () =>
    expect(badgeEmbedCode({ pageUrl, name: "QueryBird", theme: "dark" }).src).toBe(
      `${pageUrl}/badge.svg?theme=dark`,
    ));

  it("escapes the product name", () => {
    const code = badgeEmbedCode({ pageUrl, name: 'A "quoted" <b>&[x]', theme: "light" });
    expect(code.html).toContain('alt="A &#34;quoted&#34; &#60;b&#62;&#38;[x] on The SaaS Harbor"');
    expect(code.markdown).toContain('[![A "quoted" <b>&\\[x\\] on The SaaS Harbor]');
  });
});
