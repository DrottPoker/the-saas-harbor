// The badge makers embed on their own sites: a self-contained SVG with the product's verified
// MRR while it is public, and otherwise a plain "Listed on" line. It holds no text a maker wrote.
// An image on another site cannot read globals.css, so the colors repeat its surface tokens, and
// the logo uses LOGO_COLORS.
import { formatUsd } from "./domain";
import { logoSvg } from "./logo";
import { SITE_NAME } from "./seo";

export type BadgeTheme = "light" | "dark";

const THEMES: Record<BadgeTheme, Record<"surface" | "border" | "text" | "muted", string>> = {
  light: {
    surface: "#fbfaf8",
    border: "#e0ded7",
    text: "#1a1b1e",
    muted: "#585c61",
  },
  dark: {
    surface: "#22272d",
    border: "#343a42",
    text: "#e8eaed",
    muted: "#a3a9b2",
  },
};

export const BADGE_HEIGHT = 52;
const FONT = "Helvetica, Arial, sans-serif";

// Advance widths of printable ASCII (32-126) in Helvetica and Arial, in 1/1000 em. Each line
// gets its measured width as textLength, so another fallback font is fitted to the same box.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** The width of a line of text in pixels. Characters outside ASCII count as a digit. */
export function textWidth(text: string, size: number, bold = false) {
  const table = bold ? BOLD : REGULAR;
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0)! - 32;
    units += char === "·" ? 278 : (table[code] ?? 556);
  }
  return Math.ceil((units * size) / 1000);
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function badgeTheme(value: string | null): BadgeTheme {
  return value === "dark" ? "dark" : "light";
}

/** The badge for a product. `mrrCents` is set only while the product shares fresh verified MRR. */
export function badgeSvg({ mrrCents, theme }: { mrrCents: number | null; theme: BadgeTheme }) {
  const colors = THEMES[theme];
  const figure = mrrCents === null ? null : formatUsd(mrrCents);
  const label = figure ? `Verified MRR · ${SITE_NAME}` : "Listed on";
  const value = figure ?? SITE_NAME;
  const title = figure ? `Verified MRR ${figure} on ${SITE_NAME}` : `Listed on ${SITE_NAME}`;
  const labelWidth = textWidth(label, 12);
  const valueWidth = textWidth(value, 18, true);
  const width = 46 + Math.max(labelWidth, valueWidth) + 14;
  const line = (
    y: number,
    size: number,
    fill: string,
    text: string,
    measured: number,
    bold = false,
  ) =>
    `<text x="46" y="${y}" fill="${fill}" font-family="${FONT}" font-size="${size}"${
      bold ? ' font-weight="700"' : ""
    } textLength="${measured}" lengthAdjust="spacingAndGlyphs">${escapeXml(text)}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BADGE_HEIGHT}" viewBox="0 0 ${width} ${BADGE_HEIGHT}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${BADGE_HEIGHT - 1}" rx="10" fill="${colors.surface}" stroke="${colors.border}"/>`,
    logoSvg({ theme, size: 32, x: 9, y: 10 }),
    line(22, 12, colors.muted, label, labelWidth),
    line(41, 18, colors.text, value, valueWidth, true),
    `</svg>`,
  ].join("");
}

function escapeHtml(value: string) {
  return value.replace(/[<>&"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** The HTML and Markdown a maker pastes on their site, linking the badge to the product page. */
export function badgeEmbedCode({
  pageUrl,
  name,
  theme,
}: {
  pageUrl: string;
  name: string;
  theme: BadgeTheme;
}) {
  const src = `${pageUrl}/badge.svg${theme === "dark" ? "?theme=dark" : ""}`;
  const alt = `${name} on ${SITE_NAME}`;
  return {
    src,
    html: `<a href="${escapeHtml(pageUrl)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" height="${BADGE_HEIGHT}"></a>`,
    markdown: `[![${alt.replace(/[\\[\]]/g, "\\$&")}](${src})](${pageUrl})`,
  };
}
