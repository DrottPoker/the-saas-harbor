// The logo mark: a lighthouse whose beam lights a rising bar chart, above the sea. The site draws
// it with the tokens in globals.css (src/components/logo.tsx); the favicon, the sharing images and
// the badge cannot read those, so they use the same colors from LOGO_COLORS.

/** A square box around the mark, in the coordinates of its paths. */
export const LOGO_VIEWBOX = "104 45 1060 1060";

export type LogoColor = "ink" | "seaFrom" | "seaTo" | "riseFrom" | "riseTo" | "light";
export type LogoTheme = "light" | "dark";

/** Must match the --logo-* tokens in globals.css, which a unit test checks. */
export const LOGO_COLORS: Record<LogoTheme, Record<LogoColor, string>> = {
  light: {
    ink: "#0b2a55",
    seaFrom: "#0b2a55",
    seaTo: "#1b6fb3",
    riseFrom: "#72d8b2",
    riseTo: "#0b6385",
    light: "#f7a531",
  },
  dark: {
    ink: "#dbe4ef",
    seaFrom: "#9dbbe0",
    seaTo: "#3d8bd6",
    riseFrom: "#86e3c0",
    riseTo: "#14909f",
    light: "#f7b246",
  },
};

type Stop = { color: LogoColor; opacity?: number };
export type LogoGradient = {
  name: "sea" | "rise" | "beam";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: [Stop, Stop];
};

// In user space, so the bars and the arrow share one gradient, and so do the two waves.
export const LOGO_GRADIENTS: LogoGradient[] = [
  {
    name: "beam",
    x1: 600,
    y1: 0,
    x2: 1150,
    y2: 0,
    stops: [{ color: "light" }, { color: "light", opacity: 0 }],
  },
  {
    name: "rise",
    x1: 0,
    y1: 395,
    x2: 0,
    y2: 905,
    stops: [{ color: "riseFrom" }, { color: "riseTo" }],
  },
  {
    name: "sea",
    x1: 118,
    y1: 0,
    x2: 988,
    y2: 0,
    stops: [{ color: "seaFrom" }, { color: "seaTo" }],
  },
];

/** Painted in order. A paint is a gradient name or a color. */
export const LOGO_PARTS: { paint: LogoGradient["name"] | LogoColor; d: string }[] = [
  { paint: "beam", d: "M558 258L1150 125V420L558 282Z" },
  {
    // Spire, roof and lantern posts, gallery, and the tower with its base.
    paint: "ink",
    d: "M475 80C481 98 485 118 486 134C489 137 490 142 489 148C488 156 482 161 475 161C468 161 462 156 461 148C460 142 461 137 464 134C465 118 469 98 475 80ZM378 222L475 158L570 222V238H543V320H522V238H484V320H463V238H425V320H403V238H378ZM366 320H582V370H366ZM388 386H557L563 430L453 512L563 463L587 632C552 654 512 672 473 688V825C360 815 230 845 118 905C170 840 240 800 318 778Z",
  },
  { paint: "light", d: "M425 238H463V320H425ZM484 238H522V320H484Z" },
  {
    // The arrow and three bars.
    paint: "rise",
    d: "M495 697C640 660 740 560 793 490L762 475L882 395V532L848 515C760 600 640 680 495 697ZM505 725L607 690V858C575 848 540 836 505 830ZM632 682L739 628V900C700 893 665 882 632 870ZM764 610L855 548L872 558V902C835 908 800 908 764 905Z",
  },
  {
    // Two waves that meet on the left.
    paint: "sea",
    d: "M118 947C230 875 380 840 520 850C680 862 780 930 880 925C920 922 960 905 988 887C930 960 840 1000 740 993C640 985 520 935 420 912C390 906 360 904 340 905L118 947ZM118 947C200 905 290 898 340 905C460 925 560 972 660 994C720 1006 780 1010 825 1008C760 1055 650 1075 560 1050C460 1010 360 945 250 935C200 931 150 936 118 947Z",
  },
];

export function isGradient(paint: string): paint is LogoGradient["name"] {
  return LOGO_GRADIENTS.some((gradient) => gradient.name === paint);
}

/**
 * The mark as a standalone SVG. `dark` adds the dark colors for a dark color scheme, for the
 * favicon, whose tab may be either. Each color also names a class, so that override applies.
 */
export function logoSvg({
  theme = "light",
  size,
  x,
  y,
  dark = false,
}: {
  theme?: LogoTheme;
  size?: number;
  x?: number;
  y?: number;
  dark?: boolean;
}) {
  const colors = LOGO_COLORS[theme];
  const attributes = [
    'xmlns="http://www.w3.org/2000/svg"',
    `viewBox="${LOGO_VIEWBOX}"`,
    x === undefined ? "" : `x="${x}"`,
    y === undefined ? "" : `y="${y}"`,
    size === undefined ? "" : `width="${size}" height="${size}"`,
  ].filter(Boolean);
  const gradients = LOGO_GRADIENTS.map(
    ({ name, x1, y1, x2, y2, stops }) =>
      `<linearGradient id="logo-${name}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
        .map(
          (stop, index) =>
            `<stop class="${stop.color}" offset="${index}" stop-color="${colors[stop.color]}"${
              stop.opacity === undefined ? "" : ` stop-opacity="${stop.opacity}"`
            }/>`,
        )
        .join("")}</linearGradient>`,
  ).join("");
  const parts = LOGO_PARTS.map(({ paint, d }) =>
    isGradient(paint)
      ? `<path fill="url(#logo-${paint})" d="${d}"/>`
      : `<path class="${paint}" fill="${colors[paint]}" d="${d}"/>`,
  ).join("");
  const override = dark
    ? `<style>@media (prefers-color-scheme: dark){${Object.entries(LOGO_COLORS.dark)
        .map(([name, value]) => `path.${name}{fill:${value}}stop.${name}{stop-color:${value}}`)
        .join("")}}</style>`
    : "";
  return `<svg ${attributes.join(" ")}>${override}<defs>${gradients}</defs>${parts}</svg>`;
}
