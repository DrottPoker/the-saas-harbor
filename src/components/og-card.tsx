// Social sharing images, drawn by next/og (Satori): flexbox and inline styles only, and text in the
// Geist that next/og bundles. The site, products, users and statistics share a navy card in the
// dark theme's tokens from globals.css (`HarborCard`); a milestone keeps a card in the light
// theme's (`OgCard`). The logo is drawn from src/lib/logo.ts.
import { ImageResponse } from "next/og";
import { PROVIDER_TILES, TILE_MARK, TILE_SIZE } from "@/components/provider-logo";
import { imageUrl } from "@/lib/images";
import { LOGO_BEAM_ORIGIN, LOGO_COLORS, LOGO_VIEWBOX, type LogoTheme, logoSvg } from "@/lib/logo";
import { excerpt } from "@/lib/moderation";
import { ogLine, ogLines } from "@/lib/og-text";
import { PROVIDER_IDS, type ProviderId } from "@/lib/revenue/catalog";
import { SITE_NAME, siteUrl } from "@/lib/seo";

export const OG_SIZE = { width: 1200, height: 630 };

const colors = {
  background: "#e8e6df",
  muted: "#dad8d0",
  border: "#cfccc3",
  foreground: "#1a1b1e",
  mutedForeground: "#4f5358",
};

// The dark theme's tokens and the logo's light: navy stands out among the light cards most links
// carry.
const night = {
  background: "#0e1520",
  muted: "#1f2937",
  border: "#263243",
  foreground: "#e6ebf1",
  mutedForeground: "#9eacbe",
  initial: "#9dbbe0",
  initialBackground: "#1b3047",
  beam: LOGO_COLORS.dark.light,
};

export function OgMark({ size, theme = "light" }: { size: number; theme?: LogoTheme }) {
  const src = `data:image/svg+xml,${encodeURIComponent(logoSvg({ size, theme }))}`;
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img elements.
  return <img src={src} alt="" width={size} height={size} />;
}

/**
 * A logo or photo. Satori draws PNG and JPEG; other formats show initials, as the site does. On
 * navy, an image sits on the muted surface inside a border, as on the site, so a clear logo keeps
 * its edges, and a product's initial takes the blue of the logo's sea.
 */
export function OgPicture({
  path,
  name,
  round = false,
  theme = "light",
  size = 160,
}: {
  path: string | null;
  name: string;
  round?: boolean;
  theme?: LogoTheme;
  size?: number;
}) {
  const url = path && /\.(png|jpe?g)$/i.test(path) ? imageUrl(path) : null;
  const radius = round ? size / 2 : Math.round(size * 0.225);
  const dark = theme === "dark";
  const box = {
    width: size,
    height: size,
    borderRadius: radius,
    border: `2px solid ${dark ? night.border : colors.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  } as const;
  if (url && !dark)
    // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img elements.
    return <img src={url} alt="" width={size} height={size} style={{ borderRadius: radius }} />;
  if (url)
    return (
      <div style={{ ...box, background: night.muted }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img elements. */}
        <img src={url} alt="" width={size - 4} height={size - 4} />
      </div>
    );
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, round ? 2 : 1)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const [background, color] = !dark
    ? [colors.muted, colors.mutedForeground]
    : round
      ? [night.muted, night.mutedForeground]
      : [night.initialBackground, night.initial];
  return (
    <div style={{ ...box, background, color, fontSize: Math.round(size * 0.4) }}>{initials}</div>
  );
}

/** A milestone's card, in the light theme. */
export function OgCard({
  title,
  subtitle,
  picture,
  figures,
}: {
  title: string;
  subtitle: string;
  picture: React.ReactNode;
  /** Label and value pairs along the bottom. */
  figures: [string, string][];
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: colors.background,
        color: colors.foreground,
        padding: 72,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30 }}>
        <OgMark size={56} />
        The SaaS Harbor
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
        {picture}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          <div
            style={{ fontSize: title.length > 26 ? 58 : 74, letterSpacing: -2, lineHeight: 1.05 }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 32, color: colors.mutedForeground, lineHeight: 1.3 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 64,
          borderTop: `2px solid ${colors.border}`,
          paddingTop: 30,
        }}
      >
        {figures.map(([label, value]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 24, color: colors.mutedForeground }}>{label}</div>
            <div style={{ fontSize: 42, letterSpacing: -1 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The logo mark alone as a square PNG: for the favicon and the organization's logo on a clear
 * background, and for the Apple touch icon on the light page color, as iOS fills clear pixels black.
 */
export function markImage(size: number, { background = false } = {}) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: background ? colors.background : "transparent",
      }}
    >
      <OgMark size={background ? Math.round(size * 0.8) : size} />
    </div>,
    { width: size, height: size },
  );
}

/**
 * The lighthouse's beam from the lantern at (x, y), drawn like the beam in the logo: a wedge with
 * straight edges that fades along its length, in a fainter, wider one. Each is painted with
 * fill-opacity only, since resvg draws element opacity and filters through layers that show as
 * blocks across a gradient this large.
 */
function beamSvg(x: number, y: number, color: string, strength: number) {
  const { width, height } = OG_SIZE;
  const angle = (8 * Math.PI) / 180;
  const length = 1300;
  const at = (a: number) =>
    `${(x + length * Math.cos(a)).toFixed(1)},${(y + length * Math.sin(a)).toFixed(1)}`;
  const wedge = (degrees: number, opacity: number) => {
    const spread = (degrees * Math.PI) / 180;
    return `<polygon points="${x},${y - 2} ${at(angle - spread)} ${at(angle + spread)} ${x},${y + 2}" fill="url(#fade)" fill-opacity="${opacity}"/>`;
  };
  const [endX, endY] = at(angle).split(",");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="${x}" y1="${y}" x2="${endX}" y2="${endY}"><stop offset="0" stop-color="${color}" stop-opacity="${strength}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${wedge(18, 0.45)}${wedge(10, 1)}</svg>`;
}

/** A payment provider's app-icon tile, as `ProviderLogo` draws it on the site. */
function OgProviderTile({ provider, size }: { provider: ProviderId; size: number }) {
  const tile = PROVIDER_TILES[provider];
  const scale = size / TILE_SIZE;
  const radius = Math.round(5 * scale);
  const box = {
    width: size,
    height: size,
    borderRadius: radius,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
  if (tile.kind === "image") {
    const inner = Math.round(size - 2 * tile.inset * scale);
    return (
      <div style={{ ...box, background: tile.background ?? "transparent" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img elements. */}
        <img
          src={tile.src}
          alt=""
          width={inner}
          height={inner}
          style={tile.inset ? {} : { borderRadius: radius }}
        />
      </div>
    );
  }
  const viewBox = tile.viewBox ?? TILE_SIZE;
  const paint =
    tile.kind === "theme"
      ? `fill="${night.background}" fill-rule="evenodd"`
      : `fill="${tile.color}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}"><path d="${tile.path}" ${paint}/></svg>`;
  const mark = Math.round(TILE_MARK * scale);
  return (
    <div style={{ ...box, background: tile.kind === "theme" ? night.foreground : tile.background }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img elements. */}
      <img
        src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
        alt=""
        width={mark}
        height={mark}
      />
    </div>
  );
}

/**
 * The navy card of the site, products, users and statistics: the logo and the site's name under
 * the beam, the card's own content, and a row along the bottom. The site's own card ends that row
 * with its host; on the others, figures take the whole row, and networks name the host anyway.
 */
export function HarborCard({
  children,
  footer,
  host = false,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
  host?: boolean;
}) {
  const padding = 72;
  const mark = 56;
  const [left, top, side] = LOGO_VIEWBOX.split(" ").map(Number);
  const lantern = {
    x: padding + ((LOGO_BEAM_ORIGIN.x - left) / side) * mark,
    y: padding + ((LOGO_BEAM_ORIGIN.y - top) / side) * mark,
  };
  const beam = beamSvg(lantern.x, lantern.y, night.beam, 0.3);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: night.background,
        color: night.foreground,
        padding,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img elements. */}
      <img
        src={`data:image/svg+xml,${encodeURIComponent(beam)}`}
        alt=""
        width={OG_SIZE.width}
        height={OG_SIZE.height}
        style={{ position: "absolute", top: 0, left: 0 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30 }}>
        <OgMark size={mark} theme="dark" />
        {ogLine(SITE_NAME)}
      </div>
      {children}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {footer}
        {host && (
          <div style={{ fontSize: 24, color: night.mutedForeground }}>
            {new URL(siteUrl()).host}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A card's name and line of text, beside a logo or photo when there is one. The name gets smaller
 * as it gets longer, so it keeps to one line.
 */
export function HarborHeading({
  title,
  subtitle,
  picture,
}: {
  title: string;
  subtitle: string | null;
  picture?: React.ReactNode;
}) {
  // Characters per line of the 30-pixel text, with or without the picture beside it.
  const width = picture ? 50 : 64;
  const name = excerpt(title, 36);
  const size = name.length <= 14 ? 80 : name.length <= 20 ? 68 : name.length <= 28 ? 54 : 46;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
      {picture}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        <div style={{ fontSize: size, letterSpacing: -2, lineHeight: 1.05 }}>{ogLine(name)}</div>
        {subtitle && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {ogLines(subtitle, width, 2).map((text, index) => (
              <div key={index} style={{ fontSize: 30, color: night.mutedForeground }}>
                {text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export type HarborFigure = { label: string; value: string; provider?: ProviderId };

/**
 * Figures along the bottom of the card; a verified one shows its payment provider's tile. Long
 * values together, such as a category and a founder's full name, take a smaller size to fit.
 */
export function HarborFigures({ figures }: { figures: HarborFigure[] }) {
  const length = figures.reduce(
    (sum, { value, provider }) => sum + value.length + (provider ? 2 : 0),
    0,
  );
  const size = length > 36 ? 32 : 38;
  return (
    <div style={{ display: "flex", gap: 48 }}>
      {figures.map(({ label, value, provider }) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 22, color: night.mutedForeground }}>{ogLine(label)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: size }}>
            {provider && <OgProviderTile provider={provider} size={32} />}
            <div style={{ letterSpacing: -1 }}>{ogLine(value)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// The site's sharing image, also used when a product, user or statistics card has nothing to show:
// the home page's heading and the payment providers. It holds no live figures, since networks such
// as X keep a card for days.
export function siteImage() {
  return new ImageResponse(
    <HarborCard
      host
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 24, color: night.mutedForeground }}>
            {ogLine("Verify revenue with")}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {PROVIDER_IDS.map((provider) => (
              <OgProviderTile key={provider} provider={provider} size={40} />
            ))}
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 88, letterSpacing: -3, lineHeight: 1.05 }}>
          {ogLine("Get your SaaS seen.")}
        </div>
        <div
          style={{
            fontSize: 88,
            letterSpacing: -3,
            lineHeight: 1.05,
            color: night.mutedForeground,
          }}
        >
          {ogLine("List it for free.")}
        </div>
        <div style={{ fontSize: 30, color: night.mutedForeground, marginTop: 28 }}>
          {ogLine("A public page and a place on a leaderboard of verified revenue.")}
        </div>
      </div>
    </HarborCard>,
    OG_SIZE,
  );
}
