// Social sharing images, drawn by next/og (Satori): flexbox and inline styles only, and text in the
// Geist that next/og bundles. The colors are the light theme's tokens from globals.css, and the
// logo is drawn from src/lib/logo.ts.
import { ImageResponse } from "next/og";
import { imageUrl } from "@/lib/images";
import { logoSvg } from "@/lib/logo";
import { publicClient } from "@/lib/supabase/server";

export const OG_SIZE = { width: 1200, height: 630 };

const colors = {
  background: "#f6f5f1",
  muted: "#e9e8e2",
  border: "#e0ded7",
  foreground: "#1a1b1e",
  mutedForeground: "#585c61",
};

export function OgMark({ size }: { size: number }) {
  const src = `data:image/svg+xml,${encodeURIComponent(logoSvg({ size }))}`;
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

// The site's sharing image, also used when a product or maker image has nothing to show.
export async function siteImage() {
  const client = publicClient();
  const head = { count: "exact", head: true } as const;
  const [listed, ranked] = client
    ? await Promise.all([
        client.from("public_saas").select("id", head),
        client.from("leaderboard").select("id", head),
      ])
    : [];
  const figures: [string, string][] = [];
  if (listed?.count != null && !listed.error)
    figures.push(["Products listed", listed.count.toLocaleString("en-US")]);
  if (ranked?.count != null && !ranked.error)
    figures.push(["Ranked by verified MRR", ranked.count.toLocaleString("en-US")]);
  figures.push(["Verified with", "Stripe, Paddle, Polar, Dodo"]);
  return new ImageResponse(
    <OgCard
      title="Independent SaaS, ranked by revenue"
      subtitle="Monthly recurring revenue verified through each product's payment provider and shared by its founder."
      picture={<OgMark size={160} />}
      figures={figures}
    />,
    OG_SIZE,
  );
}
