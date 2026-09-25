import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOGO_COLORS, logoSvg } from "../../src/lib/logo";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

describe("logo", () => {
  it("uses the colors of the --logo-* tokens in both themes", () => {
    const [light, dark] = css.split("@variant dark");
    for (const [name, value] of Object.entries(LOGO_COLORS.light))
      expect(light).toContain(`--logo-${kebab(name)}: ${value};`);
    for (const [name, value] of Object.entries(LOGO_COLORS.dark))
      expect(dark).toContain(`--logo-${kebab(name)}: ${value};`);
  });

  it("is the favicon, with dark colors for a dark color scheme", async () => {
    // `vitest run -u` rewrites the file after the logo changes.
    await expect(logoSvg({ dark: true })).toMatchFileSnapshot("../../src/app/icon.svg");
  });

  it("draws at a size and position", () => {
    const svg = logoSvg({ theme: "dark", size: 32, x: 9, y: 10 });
    expect(svg).toMatch(/^<svg [^>]*x="9" y="10" width="32" height="32">/);
    expect(svg).toContain(`fill="${LOGO_COLORS.dark.ink}"`);
    expect(svg).not.toContain("<style>");
  });
});
