import { describe, expect, it } from "vitest";
import { ogLine, ogLines } from "../../src/lib/og-text";

const spaced = (lines: string[]) => lines.map((line) => line.replaceAll("\u00a0", " "));

describe("text on sharing images", () => {
  it("joins a line with no-break spaces, so Satori measures it whole", () => {
    expect(ogLine("Get your SaaS seen.")).toBe("Get\u00a0your\u00a0SaaS\u00a0seen.");
    expect(ogLine("Get your SaaS seen.")).not.toContain(" ");
  });

  it("keeps short text on one line", () => {
    expect(spaced(ogLines("Privacy-friendly analytics for small teams.", 50, 2))).toEqual([
      "Privacy-friendly analytics for small teams.",
    ]);
  });

  it("breaks between words as evenly as fits", () => {
    const text = "$86,420 in monthly recurring revenue across 27 independent SaaS products.";
    const lines = spaced(ogLines(text, 64, 2));
    expect(lines).toEqual([
      "$86,420 in monthly recurring revenue",
      "across 27 independent SaaS products.",
    ]);
    expect(lines.join(" ")).toBe(text);
  });

  it("cuts text longer than the lines allow with an ellipsis", () => {
    const lines = spaced(ogLines("one two three four five six seven eight nine ten", 10, 2));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("one two");
    expect(lines[1].endsWith("…")).toBe(true);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(11);
  });

  it("cuts a word longer than a line", () => {
    expect(spaced(ogLines("Supercalifragilisticexpialidocious", 12, 2))).toEqual(["Supercalifra…"]);
  });

  it("gives nothing for empty text", () => {
    expect(ogLines("   ", 20, 2)).toEqual([]);
  });
});
