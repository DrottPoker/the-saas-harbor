// Social sharing images, drawn by next/og (Satori): flexbox and inline styles only, and text in the
// Geist that next/og bundles. The cards of products, users and statistics use the light theme's
// tokens from globals.css, the site's own image the dark theme's, and the logo is drawn from
// src/lib/logo.ts.
import { ImageResponse } from "next/og";
import { PROVIDER_TILES, TILE_MARK, TILE_SIZE } from "@/components/provider-logo";
import { imageUrl } from "@/lib/images";
import { LOGO_BEAM_ORIGIN, LOGO_COLORS, LOGO_VIEWBOX, type LogoTheme, logoSvg } from "@/lib/logo";
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

export function OgMark({ size, theme = "light" }: { size: number; theme?: LogoTheme }) {
  const src = `data:image/svg+xml,${encodeURIComponent(logoSvg({ size, theme }))}`;
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img elements.
  return <img src={src} alt="" width={size} height={size} />;
}

/** A logo or photo. Satori draws PNG and JPEG; other formats show initials, as the site does. */
export function OgPicture({
  path,
  name,
  round = false,
}: {
  path: string | null;
  name: string;
  round?: boolean;
}) {
  const url = path && /\.(png|jpe?g)$/i.test(path) ? imageUrl(path) : null;
  const radius = round ? 80 : 36;
  if (url)
    // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img elements.
    return <img src={url} alt="" width={160} height={160} style={{ borderRadius: radius }} />;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, round ? 2 : 1)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    <div
      style={{
        width: 160,
        height: 160,
        borderRadius: radius,
        background: colors.muted,
        border: `2px solid ${colors.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 64,
        color: colors.mutedForeground,
      }}
    >
      {initials}
    </div>
  );
}

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

// The dark theme's tokens from globals.css and the logo's light, for the site's sharing image: navy
// stands out among the light cards most links carry.
const site = {
  background: "#0e1520",
  foreground: "#e6ebf1",
  muted: "#9eacbe",
  beam: LOGO_COLORS.dark.light,
};

/**
 * A line that never breaks. Satori measures some words too wide where it may break a line, which
 * leaves uneven gaps between them; a line joined by no-break spaces is measured whole.
 */
const line = (text: string) => text.replaceAll(" ", "\u00a0");

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
  const { foreground, background } = site;
  const viewBox = tile.viewBox ?? TILE_SIZE;
  const paint =
    tile.kind === "theme" ? `fill="${background}" fill-rule="evenodd"` : `fill="${tile.color}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}"><path d="${tile.path}" ${paint}/></svg>`;
  const mark = Math.round(TILE_MARK * scale);
  return (
    <div style={{ ...box, background: tile.kind === "theme" ? foreground : tile.background }}>
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

// The site's sharing image, also used when a product or maker image has nothing to show: the home
// page's heading under the logo and its beam, on navy, and the payment providers. It holds no live
// figures, since networks such as X keep a card for days.
export function siteImage() {
  const padding = 72;
  const mark = 56;
  const [left, top, side] = LOGO_VIEWBOX.split(" ").map(Number);
  const lantern = {
    x: padding + ((LOGO_BEAM_ORIGIN.x - left) / side) * mark,
    y: padding + ((LOGO_BEAM_ORIGIN.y - top) / side) * mark,
  };
  const beam = beamSvg(lantern.x, lantern.y, site.beam, 0.3);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: site.background,
        color: site.foreground,
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
        {line(SITE_NAME)}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 88, letterSpacing: -3, lineHeight: 1.05 }}>
          {line("Get your SaaS seen.")}
        </div>
        <div style={{ fontSize: 88, letterSpacing: -3, lineHeight: 1.05, color: site.muted }}>
          {line("List it for free.")}
        </div>
        <div style={{ fontSize: 30, color: site.muted, marginTop: 28 }}>
          {line("A public page and a place on a leaderboard of verified revenue.")}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 24, color: site.muted }}>{line("Verify revenue with")}</div>
          <div style={{ display: "flex", gap: 10 }}>
            {PROVIDER_IDS.map((provider) => (
              <OgProviderTile key={provider} provider={provider} size={40} />
            ))}
          </div>
        </div>
        <div style={{ fontSize: 24, color: site.muted }}>{new URL(siteUrl()).host}</div>
      </div>
    </div>,
    OG_SIZE,
  );
}
